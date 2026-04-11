import Ionicons from '@expo/vector-icons/Ionicons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { BrandViolet, Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  distanceMeters,
  findGymIdByOsm,
  getNearbyGyms,
  OVERPASS_COMPOUND_TAG_CHAINS,
  OVERPASS_TAGS,
  resolveGymIdFromList,
  type Gym,
} from '@/lib/gym-service'
import {
  checkIn,
  checkOut,
  crowdLevelFromCount,
  getActivePresence,
  subscribeToPresence,
  type PresenceRow,
} from '@/lib/presence-service'

const { height: SCREEN_H } = Dimensions.get('window')
const ACTIVE_RADIUS = 15 // ~50 feet — GPS accuracy floor
const POLL_INTERVAL = 10_000
const PRIVACY_SHOWN_KEY = 'gym_privacy_prompt_shown'

// ---------------------------------------------------------------------------
// Leaflet HTML — lives entirely inside the WebView
// ---------------------------------------------------------------------------
function buildMapHTML(
  lat: number,
  lng: number,
  isDark: boolean,
  avatarUrl: string | null | undefined,
  displayName: string | null | undefined,
) {
  const tile = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  const pin = BrandViolet.primary
  const pinGradientEnd = BrandViolet.mid
  const popTitle = isDark ? '#f2f0f7' : '#111111'
  const popMuted = isDark ? '#9a94b0' : '#666666'
  const popCard = isDark ? '#1c1828' : '#ffffff'
  const popTip = isDark ? '#1c1828' : '#ffffff'
  // Leaflet defaults to #ddd; at min zoom tiles don’t fill the view — match basemap so no gray/white bars.
  const mapBaseBg = isDark ? '#000000' : '#d4d4d4'
  const avatarJs = JSON.stringify(avatarUrl ?? '')
  const nameJs = JSON.stringify(displayName ?? '')

  const nodeQ = OVERPASS_TAGS.map((t) => `node[${t}](around:'+r+','+cLat+','+cLng+');`).join('')
  const wayQ = OVERPASS_TAGS.map((t) => `way[${t}](around:'+r+','+cLat+','+cLng+');`).join('')
  const compoundQ = OVERPASS_COMPOUND_TAG_CHAINS.map(
    (c) => `node[${c}](around:'+r+','+cLat+','+cLng+');way[${c}](around:'+r+','+cLat+','+cLng+');`,
  ).join('')

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${mapBaseBg}}
html,body,#map{width:100%;height:100%;background:${mapBaseBg}}
.leaflet-container{background:${mapBaseBg}!important}
.leaflet-control-attribution{display:none!important}
.pin{display:flex;align-items:center;justify-content:center;border-radius:50%;
     background:linear-gradient(155deg,${pin} 0%,${pinGradientEnd} 100%);
     box-shadow:0 2px 12px ${pin}66,0 1px 0 rgba(255,255,255,0.12) inset;color:#fff;font-size:13px}
.pin .gym-ico{width:17px;height:17px;display:block;flex-shrink:0;
     filter:drop-shadow(0 0.5px 0.75px rgba(10,6,24,.28))}
.badge{position:absolute;top:-5px;right:-7px;background:#22C55E;color:#fff;
       font-size:9px;font-weight:800;min-width:16px;height:16px;border-radius:8px;
       display:flex;align-items:center;justify-content:center;padding:0 3px}
#toast{position:fixed;top:10px;left:50%;transform:translateX(-50%);
       background:rgba(0,0,0,.75);color:#fff;padding:6px 16px;border-radius:20px;
       font:600 12px/1.4 system-ui;z-index:9999;opacity:0;transition:opacity .3s}
.leaflet-popup-content-wrapper{border-radius:14px;overflow:hidden;padding:0;
  box-shadow:0 10px 40px rgba(0,0,0,.35)!important;background:${popCard}!important}
.leaflet-popup-content{margin:0!important;width:auto!important}
.leaflet-popup-tip{background:${popTip}!important}
.user-loc-marker{background:transparent!important;border:none!important}
</style></head><body>
<div id="map"></div><div id="toast"></div>
<script>
var PIN='${pin}';
var POP_TITLE='${popTitle}';
var POP_MUTED='${popMuted}';
var USER_AVATAR=${avatarJs};
var USER_NAME=${nameJs};
var CROWD_BORDER='${isDark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.08)'}';
var map=L.map('map',{zoomControl:false}).setView([${lat},${lng}],14);
L.tileLayer('${tile}',{maxZoom:19,subdomains:'abcd'}).addTo(map);

var pins=L.layerGroup().addTo(map);
window.__applyGymCrowd=function(p){
  var root=document.querySelector('.leaflet-popup-content .gym-crowd');
  if(!root)return;
  var st=root.querySelector('.gym-crowd-status');
  var bar=root.querySelector('.gym-crowd-bar');
  var det=root.querySelector('.gym-crowd-detail');
  if(!st||!bar||!det)return;
  var idx={quiet:0,light:1,moderate:2,busy:3}[p.level];
  if(idx==null)idx=0;
  var cols={quiet:'#22C55E',light:'#84CC16',moderate:'#F59E0B',busy:'#EF4444'};
  var active=cols[p.level]||'#888';
  var mute='rgba(128,128,128,.22)';
  st.textContent=p.label;
  det.textContent=p.detail||'';
  var segs=bar.querySelectorAll('.gym-crowd-seg');
  for(var i=0;i<segs.length;i++)segs[i].style.background=i<=idx?active:mute;
};
map.on('popupopen',function(ev){
  var m=ev.popup._source;
  if(!m||m.options==null||m.options.gymOsmId==null)return;
  var t=m.options.gymOsmType||'node',id=m.options.gymOsmId;
  window.__applyGymCrowd({level:'quiet',label:'Updating…',detail:'',n:0});
  if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'gymCrowdOpen',gymOsmType:t,gymOsmId:String(id)}));
  }
});
map.on('popupclose',function(){
  if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'gymCrowdClose'}));
  }
});
var loaded=[];
var seenOsm={};
var timer=null;
var toastEl=document.getElementById('toast');
function toast(msg){toastEl.textContent=msg;toastEl.style.opacity=1;
  setTimeout(function(){toastEl.style.opacity=0},2500)}

function gymLabel(tg){
  if(!tg)return'Fitness center';
  if(tg.name&&String(tg.name).trim())return String(tg.name).trim();
  if(tg.operator&&String(tg.operator).trim())return String(tg.operator).trim();
  if(tg.brand&&String(tg.brand).trim())return String(tg.brand).trim();
  var b=tg.building,a=tg.access,i=tg.indoor;
  if((b==='apartments'||b==='residential'||tg['building:use']==='apartments')&&
     (a==='private'||a==='customers'||a==='permissive'))return'Apartment gym';
  if(i==='yes'||i==='room')return'Fitness room';
  if(a==='private'||a==='customers'||a==='permissive')return'Resident gym';
  return'Fitness center';
}

function escHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function userLocationIcon(){
  var size=40,inner=size-6;
  var url=USER_AVATAR&&String(USER_AVATAR).trim();
  var body;
  if(url){
    body='<img src="'+escAttr(url)+'" alt="" style="width:'+inner+'px;height:'+inner+'px;border-radius:50%;object-fit:cover;display:block" draggable="false"/>';
  }else{
    var ch='?';
    if(USER_NAME&&String(USER_NAME).trim())ch=String(USER_NAME).trim().charAt(0).toUpperCase();
    body='<div style="width:'+inner+'px;height:'+inner+'px;border-radius:50%;background:#4285F4;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;font-family:system-ui,sans-serif">'+escHtml(ch)+'</div>';
  }
  var h='<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.4);overflow:hidden;background:#1a1a1a;display:flex;align-items:center;justify-content:center">'+body+'</div>';
  return L.divIcon({className:'user-loc-marker',html:h,iconSize:[size,size],iconAnchor:[size/2,size/2]});
}
window.userDot=L.marker([${lat},${lng}],{icon:userLocationIcon(),zIndexOffset:1000}).addTo(map);

function gymAddress(tg){
  if(!tg)return'';
  if(tg['addr:full'])return escHtml(tg['addr:full']);
  var p1='';
  if(tg['addr:housenumber']&&tg['addr:street'])p1=escHtml(tg['addr:housenumber']+' '+tg['addr:street']);
  else if(tg['addr:street'])p1=escHtml(tg['addr:street']);
  else if(tg['addr:place'])p1=escHtml(tg['addr:place']);
  else if(tg['addr:road'])p1=escHtml(tg['addr:road']);
  var city=tg['addr:city']||tg['addr:town']||tg['addr:village'];
  var parts=[];
  if(city)parts.push(escHtml(city));
  if(tg['addr:state'])parts.push(escHtml(tg['addr:state']));
  if(tg['addr:postcode'])parts.push(escHtml(tg['addr:postcode']));
  var line2=parts.join(', ');
  var out=(p1||'')+(p1&&line2?'<br>':'')+line2;
  return out||escHtml(tg['addr:street']||'');
}

function gymPhoto(tg){
  if(!tg)return null;
  function norm(u){
    if(!u)return null;u=String(u).trim();
    if(/^https?:\\/\\//i.test(u))return u;
    if(u.indexOf('//')===0)return'https:'+u;
    return null;
  }
  var u=norm(tg.image)||norm(tg['image:0'])||norm(tg.photo);
  if(u)return u;
  var ut=tg.url;
  if(ut&&/\\.(jpe?g|png|gif|webp)(\\?|$)/i.test(String(ut)))return norm(ut)||String(ut).trim();
  var wc=tg.wikimedia_commons;
  if(wc){
    wc=String(wc).trim();
    var fn=wc.indexOf('File:')===0?wc.substring(5):wc;
    return'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(fn.replace(/ /g,'_'));
  }
  return null;
}

function gymPopup(tg){
  var nm=gymLabel(tg);
  var ad=gymAddress(tg);
  var ph=gymPhoto(tg);
  var fallback='<div style="height:112px;background:linear-gradient(155deg,'+PIN+',#1a0d35);display:flex;align-items:center;justify-content:center;font-size:40px">💪</div>';
  var top=ph
    ? '<div style="height:112px;position:relative;overflow:hidden;background:linear-gradient(155deg,'+PIN+',#1a0d35)">'+
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px">💪</div>'+
      '<img src="'+escAttr(ph)+'" alt="" loading="lazy" '+
      'style="position:relative;z-index:1;display:block;width:100%;height:112px;object-fit:cover" onerror="this.style.display=\\'none\\'"/>'+
      '</div>'
    : fallback;
  var addrHtml=ad
    ? '<div style="color:'+POP_MUTED+';font-size:13px;line-height:1.5;margin-top:8px">'+ad+'</div>'
    : '<div style="color:'+POP_MUTED+';font-size:12px;margin-top:8px;opacity:.75;font-style:italic">Address not on map yet</div>';
  var crowd='<div class="gym-crowd" style="margin-top:12px;padding-top:12px;border-top:1px solid '+CROWD_BORDER+'">'+
    '<div style="font:700 10px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;color:'+POP_MUTED+'">Live activity</div>'+
    '<div class="gym-crowd-status" style="margin-top:6px;font:700 15px/1.25 system-ui;color:'+POP_TITLE+'">Open for status</div>'+
    '<div class="gym-crowd-bar" style="display:flex;gap:3px;margin-top:10px">'+
    '<div class="gym-crowd-seg" style="flex:1;height:5px;border-radius:3px;background:rgba(128,128,128,.22)"></div>'+
    '<div class="gym-crowd-seg" style="flex:1;height:5px;border-radius:3px;background:rgba(128,128,128,.22)"></div>'+
    '<div class="gym-crowd-seg" style="flex:1;height:5px;border-radius:3px;background:rgba(128,128,128,.22)"></div>'+
    '<div class="gym-crowd-seg" style="flex:1;height:5px;border-radius:3px;background:rgba(128,128,128,.22)"></div>'+
    '</div>'+
    '<div class="gym-crowd-detail" style="margin-top:8px;font:12px/1.45 system-ui;color:'+POP_MUTED+'"></div>'+
    '</div>';
  return'<div style="width:268px;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif">'+top+
    '<div style="padding:12px 14px 16px"><div style="font-weight:800;font-size:16px;letter-spacing:-0.2px;color:'+POP_TITLE+'">'+escHtml(nm)+'</div>'+addrHtml+crowd+'</div></div>';
}

function seen(b){for(var i=0;i<loaded.length;i++){var a=loaded[i];
  if(b.s>=a.s&&b.n<=a.n&&b.w>=a.w&&b.e<=a.e)return true}return false}

function load(){
  var b=map.getBounds();
  if(!b||!b.isValid())return;
  var box={s:b.getSouth(),n:b.getNorth(),w:b.getWest(),e:b.getEast()};
  if(seen(box))return;
  var cLat=(box.s+box.n)/2, cLng=(box.w+box.e)/2;
  var latD=(box.n-box.s)*111320;
  var lngD=(box.e-box.w)*111320*Math.cos(cLat*Math.PI/180);
  var r=Math.min(Math.max(latD,lngD)/2,30000);
  if(r<1200)r=1200;
  toast('Loading gyms…');
  var q='[out:json][timeout:30];(${nodeQ}${wayQ}${compoundQ});out center;';
  fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q))
    .then(function(r){return r.json()})
    .then(function(d){
      loaded.push({s:box.s-.01,n:box.n+.01,w:box.w-.01,e:box.e+.01});
      var c=0;
      d.elements.forEach(function(el){
        var oid=(el.type||'n')+'-'+el.id;
        if(seenOsm[oid])return;
        seenOsm[oid]=true;
        var lt=el.lat||(el.center&&el.center.lat);
        var ln=el.lon||(el.center&&el.center.lon);
        if(!lt||!ln)return;
        var s=30;
        var h='<div style="position:relative;width:'+s+'px;height:'+s+'px">'+
          '<div class="pin" style="width:'+s+'px;height:'+s+'px">'+
          '<svg class="gym-ico" viewBox="0 0 24 24" aria-hidden="true" shape-rendering="geometricPrecision">'+
          '<path fill="#fff" d="M5.85 7.68H7.5C8.18 7.68 8.82 8.18 8.95 8.9V11.02H15.05V8.9C15.18 8.18 15.82 7.68 16.5 7.68H18.15C19.25 7.68 20.05 8.52 20.05 9.65V14.35C20.05 15.48 19.25 16.32 18.15 16.32H16.5C15.82 16.32 15.18 15.78 15.05 15.08V12.98H8.95V15.08C8.82 15.78 8.18 16.32 7.5 16.32H5.85C4.75 16.32 3.95 15.48 3.95 14.35V9.65C3.95 8.52 4.75 7.68 5.85 7.68Z"/>'+
          '<ellipse cx="4.78" cy="12" rx="0.92" ry="3.32" fill="rgba(255,255,255,.24)"/>'+
          '<ellipse cx="19.22" cy="12" rx="0.92" ry="3.32" fill="rgba(255,255,255,.24)"/>'+
          '</svg>'+
          '</div></div>';
        var icon=L.divIcon({className:'',iconSize:[s,s],iconAnchor:[s/2,s/2],html:h});
        L.marker([lt,ln],{icon:icon,gymOsmType:el.type||'node',gymOsmId:el.id})
          .bindPopup(gymPopup(el.tags),{maxWidth:300,closeButton:true})
          .addTo(pins);
        c++;
      });
      toast(c+' places loaded');
    }).catch(function(){toast('Could not load gyms')});
}

window.reloadGymsFromOverpass=function(){
  loaded=[];
  for(var k in seenOsm)delete seenOsm[k];
  pins.clearLayers();
  map.invalidateSize();
  load();
};

map.on('moveend',function(){clearTimeout(timer);timer=setTimeout(load,120)});

map.whenReady(function(){
  function kick(){
    map.invalidateSize();
    load();
  }
  requestAnimationFrame(kick);
  setTimeout(kick,280);
});

window.recenter=function(lt,ln){map.setView([lt,ln],15,{animate:true})};
<\/script></body></html>`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function MapScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'
  const insets = useSafeAreaInsets()
  const { session, profile, updateProfile } = useAuthContext()

  const webRef = useRef<WebView>(null)
  const gymsRef = useRef<Gym[]>([])
  const popupCrowdUnsubRef = useRef<(() => void) | null>(null)
  const sheetAnim = useRef(new Animated.Value(0)).current
  const unsubRef = useRef<(() => void) | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkedInGymRef = useRef<string | null>(null)
  const notifiedGymRef = useRef<string | null>(null)

  const [perm, setPerm] = useState<boolean | null>(null)
  const [initialCoords, setInitialCoords] = useState<{ lat: number; lng: number } | null>(null)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const [gyms, setGyms] = useState<Gym[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGym, setActiveGym] = useState<Gym | null>(null)
  const [presenceList, setPresenceList] = useState<PresenceRow[]>([])
  const [showPrivacy, setShowPrivacy] = useState(false)
  /** After the user leaves this tab once, the next focus should refetch pins (WebView stays mounted). */
  const mapTabWasBlurredRef = useRef(false)

  useEffect(() => {
    gymsRef.current = gyms
  }, [gyms])

  const clearPopupCrowdSub = useCallback(() => {
    popupCrowdUnsubRef.current?.()
    popupCrowdUnsubRef.current = null
  }, [])

  const injectGymCrowdPayload = useCallback(
    (p: { n: number; label: string; level: string; detail: string }) => {
      const json = JSON.stringify(p)
      webRef.current?.injectJavaScript(`window.__applyGymCrowd(${json});true;`)
    },
    [],
  )

  const handleWebViewMessage = useCallback(
    (ev: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(ev.nativeEvent.data) as
          | { type: 'gymCrowdOpen'; gymOsmType: string; gymOsmId: string }
          | { type: 'gymCrowdClose' }
        if (msg.type === 'gymCrowdClose') {
          clearPopupCrowdSub()
          return
        }
        if (msg.type !== 'gymCrowdOpen') return

        const run = async () => {
          clearPopupCrowdSub()
          if (!session) {
            injectGymCrowdPayload({
              n: 0,
              level: 'quiet',
              label: 'Sign in to view',
              detail: 'Log in to see how busy this gym is based on live check-ins.',
            })
            return
          }
          injectGymCrowdPayload({
            n: 0,
            level: 'quiet',
            label: 'Loading…',
            detail: 'Fetching visible check-ins…',
          })
          let gymId = resolveGymIdFromList(gymsRef.current, msg.gymOsmType, msg.gymOsmId)
          if (!gymId) gymId = await findGymIdByOsm(msg.gymOsmType, msg.gymOsmId)
          if (!gymId) {
            injectGymCrowdPayload({
              n: 0,
              level: 'quiet',
              label: 'Not synced yet',
              detail: 'This place is not in the directory yet. Move the map to load gyms, then try again.',
            })
            return
          }
          const apply = (rows: PresenceRow[]) => {
            const n = rows.length
            const { level, label } = crowdLevelFromCount(n)
            const detail =
              n === 0
                ? 'No visible check-ins in the last ~10 minutes.'
                : `${n} checked in here now (visible to others).`
            injectGymCrowdPayload({ n, level, label, detail })
          }
          try {
            apply(await getActivePresence(gymId))
          } catch {
            injectGymCrowdPayload({
              n: 0,
              level: 'quiet',
              label: 'Unavailable',
              detail: 'Could not load activity. Try again.',
            })
            return
          }
          popupCrowdUnsubRef.current = subscribeToPresence(gymId, apply)
        }
        void run()
      } catch {
        /* ignore non-JSON posts */
      }
    },
    [session, clearPopupCrowdSub, injectGymCrowdPayload],
  )

  // ---- Permission ----
  useEffect(() => {
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      setPerm(status === 'granted')
    })()
  }, [])

  // Sync user dot; refetch gyms when coming back from another tab (first focus relies on Leaflet whenReady).
  useFocusEffect(
    useCallback(() => {
      const c = coordsRef.current
      if (!c) return
      const reload = mapTabWasBlurredRef.current
      const id = setTimeout(() => {
        if (!webRef.current) return
        webRef.current.injectJavaScript(
          `if(window.userDot)window.userDot.setLatLng([${c.lat},${c.lng}]);` +
            (reload ? `if(window.reloadGymsFromOverpass)window.reloadGymsFromOverpass();` : '') +
            `true;`,
        )
      }, reload ? 80 : 0)
      return () => {
        clearTimeout(id)
        mapTabWasBlurredRef.current = true
      }
    }, []),
  )

  // ---- Initial load: show map ASAP (last known / low accuracy), then refine + gyms in background ----
  useEffect(() => {
    if (!perm) return
    let cancelled = false

    const syncDotToWebView = (lat: number, lng: number) => {
      webRef.current?.injectJavaScript(
        `if(window.userDot)window.userDot.setLatLng([${lat},${lng}]);true;`,
      )
    }

    ;(async () => {
      try {
        let c: { lat: number; lng: number } | null = null

        const last = await Location.getLastKnownPositionAsync({ maxAge: 600_000 })
        if (last?.coords) {
          c = { lat: last.coords.latitude, lng: last.coords.longitude }
        }
        if (!c) {
          try {
            const quick = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Low,
            })
            c = { lat: quick.coords.latitude, lng: quick.coords.longitude }
          } catch {
            /* try high below */
          }
        }
        if (!c) {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          })
          c = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        }

        if (cancelled || !c) return
        coordsRef.current = c
        setInitialCoords(c)
        setLoading(false)

        const refreshGyms = (lat: number, lng: number) => {
          getNearbyGyms(lat, lng)
            .then((nearby) => {
              if (!cancelled) setGyms(nearby)
            })
            .catch(() => {})
        }
        refreshGyms(c.lat, c.lng)

        try {
          const refined = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          if (cancelled) return
          const r = { lat: refined.coords.latitude, lng: refined.coords.longitude }
          coordsRef.current = r
          syncDotToWebView(r.lat, r.lng)
          refreshGyms(r.lat, r.lng)
        } catch {
          /* keep first fix */
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [perm])

  // ---- Privacy prompt (one-time) ----
  useEffect(() => {
    if (!session) return
    AsyncStorage.getItem(PRIVACY_SHOWN_KEY).then((v) => {
      if (!v) setShowPrivacy(true)
    })
  }, [session])

  // ---- Proximity polling ----
  useEffect(() => {
    if (!perm || gyms.length === 0) return

    const poll = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation })
        const c = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        coordsRef.current = c

        // Move the blue dot without reloading the WebView
        webRef.current?.injectJavaScript(
          `if(window.userDot)window.userDot.setLatLng([${c.lat},${c.lng}]);true;`,
        )

        let closest: Gym | null = null
        let closestDist = Infinity
        for (const gym of gyms) {
          const d = distanceMeters(c.lat, c.lng, gym.lat, gym.lng)
          if (d < closestDist) { closestDist = d; closest = gym }
        }

        if (closest && closestDist <= ACTIVE_RADIUS) {
          if (activeGym?.id !== closest.id) {
            setActiveGym(closest)
            enterGym(closest)

            // In-app notification
            if (notifiedGymRef.current !== closest.id) {
              notifiedGymRef.current = closest.id
              Alert.alert('Welcome!', `You've entered ${closest.name}`)
            }
          }
        } else if (activeGym) {
          leaveGym()
        }
      } catch { /* retry next tick */ }
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [perm, gyms.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Sheet animation ----
  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: activeGym ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start()
  }, [activeGym]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Enter / leave helpers ----
  const enterGym = useCallback(async (gym: Gym) => {
    if (!session || !profile) return
    unsubRef.current?.()
    unsubRef.current = subscribeToPresence(gym.id, setPresenceList)
    try {
      setPresenceList(await getActivePresence(gym.id))
    } catch {}
    try {
      await checkIn({
        userId: session.user.id,
        gymId: gym.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        streak: profile.streak ?? 0,
        shareWithOthers: profile.location_visible ?? false,
      })
      checkedInGymRef.current = gym.id
    } catch {
      /* network / RLS */
    }
  }, [session, profile])

  const leaveGym = useCallback(async () => {
    if (checkedInGymRef.current && session) {
      try { await checkOut(session.user.id, checkedInGymRef.current) } catch {}
      checkedInGymRef.current = null
    }
    unsubRef.current?.()
    unsubRef.current = null
    notifiedGymRef.current = null
    setActiveGym(null)
    setPresenceList([])
  }, [session])

  // ---- Cleanup ----
  useEffect(() => () => {
    unsubRef.current?.()
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  // ---- Handlers ----
  const handlePrivacy = async (on: boolean) => {
    await AsyncStorage.setItem(PRIVACY_SHOWN_KEY, 'true')
    setShowPrivacy(false)
    if (on) await updateProfile({ location_visible: true })
  }

  const handlePost = async () => {
    if (!activeGym || !session || !profile) return
    try {
      await checkIn({
        userId: session.user.id,
        gymId: activeGym.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        streak: profile.streak ?? 0,
        shareWithOthers: profile.location_visible ?? false,
      })
      checkedInGymRef.current = activeGym.id
    } catch {
      Alert.alert('Check-in failed', 'Could not verify you at this gym. Try again.')
      return
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
    if (r.canceled || !r.assets?.[0]) return
    router.push({ pathname: '/log-workout', params: { gymId: activeGym.id, gymName: activeGym.name } })
  }

  const handleRecenter = () => {
    const c = coordsRef.current
    if (!c || !webRef.current) return
    webRef.current.injectJavaScript(`window.recenter(${c.lat},${c.lng});true;`)
  }

  const sheetY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H * 0.45, 0],
  })

  // ---- Permission denied ----
  if (perm === false) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Ionicons name="location-outline" size={56} color={colors.textMuted} />
        <ThemedText style={[styles.permTitle, { color: colors.text }]}>
          Location required
        </ThemedText>
        <ThemedText style={[styles.permBody, { color: colors.textMuted }]}>
          Uplift needs your location to find nearby gyms and let you post.
        </ThemedText>
        <Pressable
          style={[styles.pill, { backgroundColor: BrandViolet.primary }]}
          onPress={() => Linking.openSettings()}
        >
          <ThemedText style={styles.pillText}>Open Settings</ThemedText>
        </Pressable>
      </View>
    )
  }

  // ---- Loading ----
  if (loading || perm === null || !initialCoords) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
        <ThemedText style={[styles.loadingLabel, { color: colors.textMuted }]}>
          Finding your location…
        </ThemedText>
      </View>
    )
  }

  const others = presenceList.filter((p) => p.user_id !== session?.user?.id)

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Map */}
      {initialCoords && (
        <WebView
          ref={webRef}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: isDark ? '#000000' : '#d4d4d4' },
          ]}
          originWhitelist={['*']}
          source={{
            html: buildMapHTML(
              initialCoords.lat,
              initialCoords.lng,
              isDark,
              profile?.avatar_url,
              profile?.display_name,
            ),
          }}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled
          onMessage={handleWebViewMessage}
          onLoadEnd={() => {
            const c = coordsRef.current
            if (!c) return
            webRef.current?.injectJavaScript(
              `if(window.userDot)window.userDot.setLatLng([${c.lat},${c.lng}]);true;`,
            )
          }}
        />
      )}

      {/* Recenter */}
      <Pressable
        onPress={handleRecenter}
        style={[styles.fab, { top: insets.top + 12, backgroundColor: colors.card }]}
      >
        <Ionicons name="navigate" size={20} color={colors.text} />
      </Pressable>

      {/* Prompt when no gym */}
      {!activeGym && (
        <View style={styles.hintWrap} pointerEvents="none">
          <View style={[styles.hintPill, { backgroundColor: colors.card }]}>
            <Ionicons name="walk-outline" size={16} color={colors.textMuted} />
            <ThemedText style={[styles.hintText, { color: colors.textMuted }]}>
              Head to a gym to post
            </ThemedText>
          </View>
        </View>
      )}

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + 20,
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: colors.textMuted + '30' }]} />
        </View>

        {activeGym?.image_url ? (
          <Image
            source={{ uri: activeGym.image_url }}
            style={styles.sheetHero}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.sheetHeroPlaceholder, { backgroundColor: BrandViolet.primary + '18' }]}>
            <Ionicons name="barbell" size={36} color={BrandViolet.primary} />
          </View>
        )}

        <ThemedText type="title" style={[styles.sheetName, { color: colors.text }]}>
          {activeGym?.name ?? ''}
        </ThemedText>

        {activeGym?.address ? (
          <ThemedText style={[styles.sheetAddress, { color: colors.textMuted }]}>
            {activeGym.address}
          </ThemedText>
        ) : activeGym ? (
          <ThemedText style={[styles.sheetAddress, { color: colors.textMuted, fontStyle: 'italic' }]}>
            Address not on map yet
          </ThemedText>
        ) : null}

        {/* Presence avatars */}
        {others.length > 0 ? (
          <View style={styles.presenceWrap}>
            <ThemedText style={[styles.presenceLabel, { color: colors.textMuted }]}>
              {others.length} {others.length === 1 ? 'person' : 'people'} here now
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.avatarScroll}
            >
              {others.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.avatarItem}
                  onPress={() =>
                    Alert.alert(p.display_name ?? 'User', `🔥 ${p.streak} day streak`, [
                      { text: 'Close', style: 'cancel' },
                      {
                        text: 'View Profile',
                        onPress: () =>
                          router.push({ pathname: '/friend-profile', params: { id: p.user_id } }),
                      },
                    ])
                  }
                >
                  <View style={[styles.avatar, { borderColor: colors.tint + '40' }]}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.avatarImg} />
                    ) : (
                      <View style={[styles.avatarFallback, { backgroundColor: colors.tint + '18' }]}>
                        <ThemedText style={[styles.avatarLetter, { color: colors.tint }]}>
                          {(p.display_name ?? '?')[0].toUpperCase()}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  <ThemedText
                    style={[styles.avatarName, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {p.display_name?.split(' ')[0] ?? 'User'}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : (
          <ThemedText style={[styles.emptyPresence, { color: colors.textMuted }]}>
            No one else here right now
          </ThemedText>
        )}

        <Pressable style={[styles.postBtn, { backgroundColor: BrandViolet.primary }]} onPress={handlePost}>
          <Ionicons name="camera" size={20} color="#fff" />
          <ThemedText style={styles.postBtnLabel}>Post from here</ThemedText>
        </Pressable>
      </Animated.View>

      {/* Privacy modal */}
      <Modal visible={showPrivacy} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: BrandViolet.primary + '15' }]}>
              <Ionicons name="location" size={28} color={BrandViolet.primary} />
            </View>
            <ThemedText type="title" style={[styles.modalTitle, { color: colors.text }]}>
              Show yourself at the gym?
            </ThemedText>
            <ThemedText style={[styles.modalBody, { color: colors.textMuted }]}>
              Let friends see when you're at the same gym. You can change this anytime in Settings.
            </ThemedText>
            <Pressable
              style={[styles.pill, { backgroundColor: BrandViolet.primary, width: '100%' }]}
              onPress={() => handlePrivacy(true)}
            >
              <ThemedText style={styles.pillText}>Turn on</ThemedText>
            </Pressable>
            <Pressable style={styles.modalSkip} onPress={() => handlePrivacy(false)}>
              <ThemedText style={[styles.modalSkipText, { color: colors.textMuted }]}>Not now</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 },

  // Permission
  permTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  permBody: { fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 280 },

  // Loading
  loadingLabel: { fontSize: 14, fontWeight: '500', marginTop: 4 },

  // Shared pill button
  pill: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // FAB
  fab: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },

  // Hint
  hintWrap: { position: 'absolute', bottom: 110, left: 0, right: 0, alignItems: 'center' },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  hintText: { fontSize: 13, fontWeight: '600' },

  // Sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    minHeight: SCREEN_H * 0.28,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.10, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
  handle: { alignItems: 'center', marginBottom: 10 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  sheetHero: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#111',
  },
  sheetHeroPlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetName: { fontSize: 20, fontWeight: '600', marginBottom: 6, letterSpacing: -0.25 },
  sheetAddress: { fontSize: 13, lineHeight: 19, marginBottom: 14 },

  // Presence
  presenceWrap: { marginBottom: 18 },
  presenceLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  avatarScroll: { gap: 14 },
  avatarItem: { alignItems: 'center', width: 58 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 20, fontWeight: '700' },
  avatarName: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  emptyPresence: { fontSize: 14, marginBottom: 18 },

  // Post
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  postBtnLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modal: { width: '100%', borderRadius: 24, padding: 28, alignItems: 'center' },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 20, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  modalBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  modalSkip: { paddingVertical: 10 },
  modalSkipText: { fontSize: 15, fontWeight: '500' },
})
