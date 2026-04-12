/**
 * Stable Leaflet HTML for the main map WebView (theme/avatar applied via inject — not by rebuilding this string).
 *
 * Map look: set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` and publish a minimal dark style in Mapbox Studio
 * (roads / water / buildings only, no place labels) then set `EXPO_PUBLIC_MAPBOX_STYLE_PATH` to `username/styleid`.
 * Without a token, Carto basemaps are used (`dark_all` / `light_all`).
 */
import { BrandViolet } from '@/constants/theme'
import { OVERPASS_COMPOUND_TAG_CHAINS, OVERPASS_TAGS } from '@/lib/gym-service'

const MAP_BOOT_LAT = 40.1028
const MAP_BOOT_LNG = -88.2272
/** User-specified pulse / active ring accent */
export const UPLIFT_MAP_PURPLE = '#5239FF'

export function buildUpliftMapLeafletHTML(safeTopPx: number, safeBottomPx: number): string {
  const nodeQ = OVERPASS_TAGS.map((t) => `node[${t}](around:'+r+','+cLat+','+cLng+');`).join('')
  const wayQ = OVERPASS_TAGS.map((t) => `way[${t}](around:'+r+','+cLat+','+cLng+');`).join('')
  const compoundQ = OVERPASS_COMPOUND_TAG_CHAINS.map(
    (c) => `node[${c}](around:'+r+','+cLat+','+cLng+');way[${c}](around:'+r+','+cLat+','+cLng+');`,
  ).join('')

  const topPad = Math.max(0, Math.round(safeTopPx))
  const botPad = Math.max(0, Math.round(safeBottomPx))
  const pinMid = BrandViolet.mid

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000000}
html,body,#map{width:100%;height:100%;background:#000000}
.leaflet-container{background:#000000!important}
.leaflet-control-attribution{display:none!important}
.marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background:transparent!important}
.marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{background:rgba(17,17,17,.88)!important}
#toast{position:fixed;top:10px;left:50%;transform:translateX(-50%);
       background:rgba(0,0,0,.78);color:#fff;padding:8px 18px;border-radius:22px;
       font:600 13px/1.35 system-ui;z-index:99999;opacity:0;transition:opacity .25s ease;pointer-events:none}
.user-loc-marker{background:transparent!important;border:none!important}
.presence-peer-marker{background:transparent!important;border:none!important;cursor:pointer!important}
.user-loc-breathe{animation:userBreathe 2s ease-in-out infinite;transform-origin:center center}
@keyframes userBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.user-loc-face{box-shadow:0 0 0 3px #fff,0 2px 10px rgba(0,0,0,.45);border-radius:50%}
.gym-name-lbl{background:rgba(0,0,0,.55)!important;border:none!important;box-shadow:none!important;color:#e8e4f0!important;
  font:700 11px/1.2 system-ui,sans-serif!important;padding:2px 6px!important;border-radius:6px!important}
.gym-pulse-wrap{position:relative;width:48px;height:56px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;pointer-events:auto}
.gym-pulse-rings{position:relative;width:36px;height:36px}
.gym-pulse-core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:9px;height:9px;border-radius:50%;background:${UPLIFT_MAP_PURPLE};z-index:2;
  box-shadow:0 0 10px rgba(82,57,255,.9)}
.gym-pulse-ring{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:9px;height:9px;border-radius:50%;border:2px solid rgba(82,57,255,.55);animation:gymRippleSlow 2.4s ease-out infinite}
.gym-pulse-wrap.gym-hot .gym-pulse-ring{animation:gymRippleFast .75s ease-out infinite;border-color:rgba(82,57,255,.95);
  box-shadow:0 0 14px rgba(82,57,255,.75)}
.gym-pulse-wrap.gym-hot .gym-pulse-core{box-shadow:0 0 16px rgba(82,57,255,1)}
.gym-pulse-wrap.gym-cold .gym-pulse-ring{opacity:.35;animation-duration:3s}
.gym-pulse-wrap.gym-arena-pulse .gym-pulse-ring{animation:gymRippleFast .45s ease-out infinite!important;opacity:1!important}
.gym-pulse-wrap.gym-arena-bump .gym-pulse-rings{animation:gymBump .5s ease-out}
@keyframes gymBump{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1.12)}}
@keyframes gymRippleSlow{0%{width:9px;height:9px;opacity:.55}100%{width:34px;height:34px;opacity:0}}
@keyframes gymRippleFast{0%{width:9px;height:9px;opacity:.85}100%{width:38px;height:38px;opacity:0}}
.uplift-cluster-wrap{background:transparent!important;border:none!important}
.uplift-cluster{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;
  background:#111;border:1px solid rgba(255,255,255,.12);font:900 14px system-ui,sans-serif;color:#fff}
.uplift-cluster-n{text-shadow:0 1px 2px rgba(0,0,0,.8)}
.ghost-stack{position:relative;width:40px;height:40px;opacity:.42;pointer-events:none}
.ghost-stack img{position:absolute;width:22px;height:22px;border-radius:50%;border:2px solid #111;object-fit:cover}
.skel-dot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;
  background:#333;animation:skelPulse 1s ease-in-out infinite}
@keyframes skelPulse{0%,100%{opacity:.35;transform:translate(-50%,-50%) scale(1)}50%{opacity:.85;transform:translate(-50%,-50%) scale(1.15)}}
</style></head><body>
<div id="map"></div><div id="toast"></div>
<script>
window.__UPLIFT_MAP_CFG=window.__UPLIFT_MAP_CFG||{mapboxToken:'',mapboxStylePath:'mapbox/dark-v11',theme:'dark'};
var SAFE_TOP=${topPad};
var SAFE_BOTTOM=${botPad};
var PIN_FALLBACK='${pinMid}';
var map=L.map('map',{zoomControl:false}).setView([${MAP_BOOT_LAT},${MAP_BOOT_LNG}],14);
var baseLayer=null;
function mbTileUrl(){
  var c=window.__UPLIFT_MAP_CFG||{};
  var t=(c.mapboxToken||'').trim();
  if(!t)return null;
  var p=(c.mapboxStylePath||'mapbox/dark-v11').replace(/^\\//,'');
  return 'https://api.mapbox.com/styles/v1/'+p+'/tiles/512/{z}/{x}/{y}@2x?access_token='+encodeURIComponent(t);
}
function applyBaseLayer(){
  if(baseLayer){try{map.removeLayer(baseLayer);}catch(e){}baseLayer=null;}
  var u=mbTileUrl();
  var th=(window.__UPLIFT_MAP_CFG&&window.__UPLIFT_MAP_CFG.theme)==='light';
  if(u){
    baseLayer=L.tileLayer(u,{tileSize:512,zoomOffset:-1,maxZoom:22,attribution:'© Mapbox © OSM'}).addTo(map);
    return;
  }
  var carto=th
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  baseLayer=L.tileLayer(carto,{maxZoom:19,subdomains:'abcd'}).addTo(map);
}
applyBaseLayer();

var ghostPins=L.layerGroup().addTo(map);
var skeletonPins=L.layerGroup().addTo(map);
var pins=L.markerClusterGroup({
  maxClusterRadius:52,spiderfyOnMaxZoom:true,showCoverageOnHover:false,zoomToBoundsOnClick:true,
  iconCreateFunction:function(cluster){
    var n=cluster.getChildCount();
    var sum=0;
    cluster.getAllChildMarkers().forEach(function(m){sum+=(m.options.presenceCount|0);});
    var g=Math.min(sum,10)/10;
    var blur=8+g*22;
    var alpha=.25+g*.55;
    var html='<div class="uplift-cluster" style="box-shadow:0 0 '+blur+'px rgba(82,57,255,'+alpha+')"><span class="uplift-cluster-n">'+n+'</span></div>';
    return L.divIcon({html:html,className:'uplift-cluster-wrap',iconSize:L.point(40,40)});
  }
});
map.addLayer(pins);

var presencePeers=L.layerGroup().addTo(map);

function ensureGymPopupInView(){}

window.__setTheme=function(theme){
  window.__UPLIFT_MAP_CFG=window.__UPLIFT_MAP_CFG||{};
  window.__UPLIFT_MAP_CFG.theme=theme==='light'?'light':'dark';
  var bg=window.__UPLIFT_MAP_CFG.theme==='light'?'#d4d4d4':'#000000';
  document.documentElement.style.background=bg;
  document.body.style.background=bg;
  var el=document.getElementById('map');
  if(el)el.style.background=bg;
  try{map.getContainer().style.background=bg;}catch(e){}
  applyBaseLayer();
};

window.__updateUserDot=function(avatarUrl,displayName){
  USER_AVATAR=avatarUrl==null?'':String(avatarUrl);
  USER_NAME=displayName==null?'':String(displayName);
  try{
    if(window.userDot){
      window.userDot.setIcon(userLocationIcon());
    }
  }catch(e){}
};

var USER_AVATAR='';
var USER_NAME='';

function userLocationIcon(){
  var size=44,inner=size-14;
  var url=USER_AVATAR&&String(USER_AVATAR).trim();
  var body;
  if(url){
    body='<img class="user-loc-face" src="'+escAttr(url)+'" alt="" draggable="false" style="width:'+inner+'px;height:'+inner+'px;object-fit:cover;display:block"/>';
  }else{
    var ch='?';
    if(USER_NAME&&String(USER_NAME).trim())ch=String(USER_NAME).trim().charAt(0).toUpperCase();
    body='<div class="user-loc-face" style="width:'+inner+'px;height:'+inner+'px;background:#4285F4;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;font-family:system-ui,sans-serif">'+escHtml(ch)+'</div>';
  }
  var h='<div class="user-loc-breathe" style="position:relative;width:'+size+'px;height:'+size+'px;display:flex;align-items:center;justify-content:center">'+body+'</div>';
  return L.divIcon({className:'user-loc-marker',html:h,iconSize:[size,size],iconAnchor:[size/2,size/2]});
}
window.userDot=L.marker([${MAP_BOOT_LAT},${MAP_BOOT_LNG}],{icon:userLocationIcon(),zIndexOffset:1000}).addTo(map);

window.clearPresencePeers=function(){try{presencePeers.clearLayers();}catch(e){}};
window.setPresencePeers=function(encoded){
  try{
    var list=JSON.parse(decodeURIComponent(encoded));
    if(!Array.isArray(list))return;
    presencePeers.clearLayers();
    for(var i=0;i<list.length;i++){
      var p=list[i];
      if(p.lat==null||p.lng==null||!p.userId)continue;
      var ic=peerPresenceIcon(p.avatarUrl||'',p.displayName||'');
      var mk=L.marker([p.lat,p.lng],{icon:ic,zIndexOffset:850});
      (function(uid){
        mk.on('click',function(ev){
          if(L.DomEvent&&L.DomEvent.stopPropagation)L.DomEvent.stopPropagation(ev);
          if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'presencePinTap',userId:uid}));
          }
        });
      })(p.userId);
      mk.addTo(presencePeers);
    }
  }catch(e){}
};

function peerPresenceIcon(avatarUrl,displayName){
  var size=36,inner=size-6;
  var url=avatarUrl&&String(avatarUrl).trim();
  var body;
  if(url){
    body='<img src="'+escAttr(url)+'" alt="" style="width:'+inner+'px;height:'+inner+'px;border-radius:50%;object-fit:cover;display:block" draggable="false"/>';
  }else{
    var ch='?';
    if(displayName&&String(displayName).trim())ch=String(displayName).trim().charAt(0).toUpperCase();
    body='<div style="width:'+inner+'px;height:'+inner+'px;border-radius:50%;background:'+PIN_FALLBACK+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;font-family:system-ui,sans-serif">'+escHtml(ch)+'</div>';
  }
  var h='<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.4);overflow:hidden;background:#1a1a1a;display:flex;align-items:center;justify-content:center">'+body+'</div>';
  return L.divIcon({className:'presence-peer-marker',html:h,iconSize:[size,size],iconAnchor:[size/2,size/2]});
}

function escHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

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

var loaded=[];
var seenOsm={};
var timer=null;
var silentRetryTimer=null;
var toastEl=document.getElementById('toast');
function toast(msg){toastEl.textContent=msg;toastEl.style.opacity=1;
  setTimeout(function(){toastEl.style.opacity=0},2500)}
function scheduleSilentOverpassRetry(){
  if(silentRetryTimer)return;
  silentRetryTimer=setTimeout(function(){
    silentRetryTimer=null;
    try{load(0);}catch(e){}
  },10000+Math.floor(Math.random()*8000));
}
var OVERPASS_URLS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
function fetchOverpassJson(q,urlIndex){
  urlIndex=urlIndex||0;
  var u=OVERPASS_URLS[urlIndex]||OVERPASS_URLS[0];
  return fetch(u+'?data='+encodeURIComponent(q))
    .then(function(res){
      if(!res.ok)throw new Error('http');
      return res.json();
    })
    .then(function(d){
      if(!d||!Array.isArray(d.elements))throw new Error('shape');
      return d;
    })
    .catch(function(err){
      if(urlIndex+1<OVERPASS_URLS.length)return fetchOverpassJson(q,urlIndex+1);
      throw err;
    });
}

function seen(b){for(var i=0;i<loaded.length;i++){var a=loaded[i];
  if(b.s>=a.s&&b.n<=a.n&&b.w>=a.w&&b.e<=a.e)return true}return false}

function postRN(obj){
  try{
    if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }catch(e){}
}

function eachGymMarker(fn){
  pins.eachLayer(function(layer){
    if(layer&&typeof layer.getAllChildMarkers==='function'){
      layer.getAllChildMarkers().forEach(function(m){
        if(m&&m.options&&m.options.gymOsmId!=null)fn(m);
      });
    }else if(layer&&layer.options&&layer.options.gymOsmId!=null){
      fn(layer);
    }
  });
}

window.__applyPresenceToMarkers=function(enc){
  try{
    var mapCounts=JSON.parse(decodeURIComponent(enc));
    if(!mapCounts||typeof mapCounts!=='object')return;
    eachGymMarker(function(layer){
      var k=(layer.options.gymOsmType||'node')+'-'+String(layer.options.gymOsmId);
      var n=mapCounts[k]|0;
      layer.options.presenceCount=n;
      var el=layer.getElement&&layer.getElement();
      if(!el)return;
      var w=el.querySelector('.gym-pulse-wrap');
      if(!w)return;
      w.classList.remove('gym-hot','gym-cold');
      if(n>0)w.classList.add('gym-hot');else w.classList.add('gym-cold');
    });
    try{pins.refreshClusters&&pins.refreshClusters();}catch(e2){}
  }catch(e){}
};

window.__highlightGymForArena=function(osmKey){
  try{
    eachGymMarker(function(layer){
      var k=(layer.options.gymOsmType||'node')+'-'+String(layer.options.gymOsmId);
      if(k!==osmKey)return;
      var el=layer.getElement&&layer.getElement();
      if(!el)return;
      var w=el.querySelector('.gym-pulse-wrap');
      if(!w)return;
      w.classList.add('gym-arena-pulse','gym-arena-bump');
      setTimeout(function(){w.classList.remove('gym-arena-bump');},600);
    });
    try{pins.refreshClusters&&pins.refreshClusters();}catch(e2){}
  }catch(e){}
};

window.__clearSkeletonLayer=function(){
  try{skeletonPins.clearLayers();}catch(e){}
};

window.__addSkeletonLatLngs=function(enc){
  try{
    skeletonPins.clearLayers();
    var arr=JSON.parse(decodeURIComponent(enc));
    if(!Array.isArray(arr))return;
    for(var i=0;i<arr.length;i++){
      var p=arr[i];
      if(!p||p.length<2)continue;
      var ic=L.divIcon({className:'',html:'<div class="skel-dot"></div>',iconSize:[20,20],iconAnchor:[10,10]});
      L.marker([p[0],p[1]],{icon:ic,interactive:false,zIndexOffset:50}).addTo(skeletonPins);
    }
  }catch(e){}
};

window.__setGhostPresence=function(enc){
  try{
    ghostPins.clearLayers();
    var list=JSON.parse(decodeURIComponent(enc));
    if(!Array.isArray(list))return;
    for(var i=0;i<list.length;i++){
      var g=list[i];
      if(g.lat==null||g.lng==null)continue;
      var urls=(g.avatars&&g.avatars.length)?g.avatars:[];
      var h='<div class="ghost-stack">';
      for(var j=0;j<urls.length&&j<3;j++){
        var left=4+j*10;
        var top=4+(j%2)*4;
        h+='<img src="'+escAttr(urls[j])+'" alt="" style="left:'+left+'px;top:'+top+'px;z-index:'+(5-j)+'"/>';
      }
      h+='</div>';
      var ic=L.divIcon({html:h,className:'',iconSize:[44,44],iconAnchor:[22,22]});
      L.marker([g.lat,g.lng],{icon:ic,interactive:false,zIndexOffset:400}).addTo(ghostPins);
    }
  }catch(e){}
};

function addOneGymMarker(lt,ln,tagsObj,gymOsmType,gymOsmId,tagsJsonStr,presenceCount){
  var pc=presenceCount|0;
  var hotCold=pc>0?'gym-hot':'gym-cold';
  var nm=gymLabel(tagsObj);
  var h='<div class="gym-pulse-wrap '+hotCold+'" data-oid="'+(gymOsmType||'node')+'-'+escAttr(String(gymOsmId))+'">'+
    '<div class="gym-pulse-rings"><div class="gym-pulse-ring"></div><div class="gym-pulse-core"></div></div>'+
    '<div style="margin-top:2px;max-width:120px;text-align:center;font:700 10px/1.2 system-ui,sans-serif;color:#e8e4f0;text-shadow:0 1px 3px #000">'+escHtml(nm)+'</div></div>';
  var icon=L.divIcon({className:'',iconSize:[48,56],iconAnchor:[24,50],html:h});
  var mk=L.marker([lt,ln],{
    icon:icon,
    gymOsmType:gymOsmType||'node',
    gymOsmId:gymOsmId,
    gymOsmTagsJson:tagsJsonStr,
    presenceCount:pc
  });
  mk.on('click',function(){
    postRN({
      type:'gymPinTap',
      gymOsmType:gymOsmType||'node',
      gymOsmId:String(gymOsmId),
      lat:lt,
      lng:ln,
      tagsJson:tagsJsonStr,
      name:nm
    });
  });
  mk.addTo(pins);
}

window.__hydrateSnapshot=function(enc){
  try{
    var items=JSON.parse(decodeURIComponent(enc));
    if(!Array.isArray(items))return;
    for(var i=0;i<items.length;i++){
      var it=items[i];
      if(it==null||it.lat==null||it.lng==null||it.gymOsmId==null)continue;
      var oid=(it.gymOsmType||'node')+'-'+String(it.gymOsmId);
      if(seenOsm[oid])continue;
      seenOsm[oid]=true;
      var tags={};
      try{var pj=JSON.parse(it.tagsJson||'{}');if(pj&&typeof pj==='object'&&!Array.isArray(pj))tags=pj;}catch(e2){tags={};}
      addOneGymMarker(it.lat,it.lng,tags,it.gymOsmType||'node',String(it.gymOsmId),it.tagsJson||'{}',0);
    }
    map.invalidateSize();
  }catch(e){}
};

function load(retry){
  retry=retry||0;
  var b=map.getBounds();
  if(!b||!b.isValid()){
    if(retry<14)setTimeout(function(){load(retry+1);},45);
    return;
  }
  var box={s:b.getSouth(),n:b.getNorth(),w:b.getWest(),e:b.getEast()};
  if(seen(box))return;
  var cLat=(box.s+box.n)/2, cLng=(box.w+box.e)/2;
  var latD=(box.n-box.s)*111320;
  var lngD=(box.e-box.w)*111320*Math.cos(cLat*Math.PI/180);
  var r=Math.min(Math.max(latD,lngD)/2,30000);
  if(r<1200)r=1200;
  var q='[out:json][timeout:35];(${nodeQ}${wayQ}${compoundQ});out center;';
  fetchOverpassJson(q,0)
    .then(function(d){
      if(silentRetryTimer){clearTimeout(silentRetryTimer);silentRetryTimer=null;}
      loaded.push({s:box.s-.01,n:box.n+.01,w:box.w-.01,e:box.e+.01});
      var c=0;
      d.elements.forEach(function(el){
        var oid=(el.type||'n')+'-'+el.id;
        if(seenOsm[oid])return;
        seenOsm[oid]=true;
        var lt=el.lat||(el.center&&el.center.lat);
        var ln=el.lon||(el.center&&el.center.lon);
        if(!lt||!ln)return;
        var tags=el.tags&&typeof el.tags==='object'?el.tags:{};
        var tagsJson=JSON.stringify(tags);
        addOneGymMarker(lt,ln,tags,el.type||'node',String(el.id),tagsJson,0);
        c++;
      });
      postRN({type:'gymLoadSuccess'});
      try{
        var snap=[];
        eachGymMarker(function(layer){
          var ll=layer.getLatLng();
          snap.push({
            gymOsmType:layer.options.gymOsmType||'node',
            gymOsmId:String(layer.options.gymOsmId),
            lat:ll.lat,
            lng:ll.lng,
            tagsJson:layer.options.gymOsmTagsJson||'{}'
          });
        });
        if(snap.length){
          postRN({
            type:'gymPinSnapshot',
            items:snap,
            centerLat:cLat,
            centerLng:cLng
          });
        }
      }catch(eSnap){}
    })
    .catch(function(){
      postRN({type:'gymLoadSuccess'});
      scheduleSilentOverpassRetry();
    });
}

window.__kickGymLoad=function(){
  try{map.invalidateSize();load();}catch(e){}
};
window.__invalidateLeafletSize=function(){
  try{map.invalidateSize();}catch(e){}
};

window.reloadGymsFromOverpass=function(){
  loaded=[];
  for(var k in seenOsm)delete seenOsm[k];
  pins.clearLayers();
  map.invalidateSize();
  setTimeout(function(){load(0);},0);
};

map.on('moveend',function(){clearTimeout(timer);timer=setTimeout(load,220)});

map.whenReady(function(){
  function kick(){
    try{map.invalidateSize();load();}catch(e){}
  }
  requestAnimationFrame(kick);
  setTimeout(kick,140);
});

window.recenter=function(lt,ln){map.setView([lt,ln],15,{animate:true})};
<\/script></body></html>`
}
