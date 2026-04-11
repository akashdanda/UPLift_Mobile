import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

import { ThemedText } from '@/components/themed-text'
import { BrandViolet, Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { fetchGymById, type Gym } from '@/lib/gym-service'
import {
  checkIn,
  getActivePresence,
  subscribeToPresence,
  type PresenceRow,
} from '@/lib/presence-service'

const { width: WIN_W, height: WIN_H } = Dimensions.get('window')
/** Tight zoom so the map reads as “this building / lot”. */
const ARENA_ZOOM = 18

type PresencePin = {
  userId: string
  displayName: string
  avatarUrl: string | null
  isSelf: boolean
}

function buildPresencePins(
  rows: PresenceRow[],
  selfId: string,
  selfName: string | null,
  selfAvatar: string | null,
): PresencePin[] {
  const visible = rows.filter((r) => r.share_with_others !== false)
  const byUser = new Map<string, PresenceRow>()
  for (const r of visible) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, r)
  }
  const list: PresencePin[] = [...byUser.values()].map((r) => ({
    userId: r.user_id,
    displayName: r.display_name ?? 'Member',
    avatarUrl: r.avatar_url,
    isSelf: r.user_id === selfId,
  }))
  if (!byUser.has(selfId)) {
    list.unshift({
      userId: selfId,
      displayName: selfName ?? 'You',
      avatarUrl: selfAvatar,
      isSelf: true,
    })
  }
  const selfFirst = list.filter((p) => p.isSelf)
  const rest = list.filter((p) => !p.isSelf)
  return [...selfFirst, ...rest]
}

/** Small ring in meters so pins sit on/near the building at high zoom. */
function peerOffsetsAroundGym(lat: number, lng: number, count: number, ringMeters: number) {
  const out: { lat: number; lng: number }[] = []
  if (count <= 0) return out
  const cosLat = Math.cos((lat * Math.PI) / 180)
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    const dx = ringMeters * Math.sin(angle)
    const dy = ringMeters * Math.cos(angle)
    const dLat = dy / 111320
    const dLng = dx / (111320 * Math.max(0.2, Math.abs(cosLat)))
    out.push({ lat: lat + dLat, lng: lng + dLng })
  }
  return out
}

function geoSlotsForPins(count: number, gymLat: number, gymLng: number) {
  if (count <= 0) return []
  if (count <= 8) return peerOffsetsAroundGym(gymLat, gymLng, count, 12)
  const innerN = Math.ceil(count / 2)
  const outerN = count - innerN
  const inner = peerOffsetsAroundGym(gymLat, gymLng, innerN, 9)
  const outer = peerOffsetsAroundGym(gymLat, gymLng, outerN, 20)
  return [...inner, ...outer]
}

// ---------------------------------------------------------------------------
// Leaflet — zoomed gym “lot” view (same tiles as main map)
// ---------------------------------------------------------------------------
function buildArenaMapHTML(lat: number, lng: number, isDark: boolean) {
  const tile = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  const mapBaseBg = isDark ? '#000000' : '#d4d4d4'
  const pin = BrandViolet.primary

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:${mapBaseBg}}
html,body,#map{width:100%;height:100%;background:${mapBaseBg}}
.leaflet-container{background:${mapBaseBg}!important;font-family:system-ui,sans-serif}
.leaflet-control-attribution{display:none!important}
.presence-peer-marker{background:transparent!important;border:none!important;cursor:pointer!important}
</style></head><body>
<div id="map"></div>
<script>
var PIN='${pin}';
var GYM_LAT=${lat}, GYM_LNG=${lng}, ZOOM=${ARENA_ZOOM};
var map=L.map('map',{
  zoomControl:false,
  dragging:false,
  scrollWheelZoom:false,
  doubleClickZoom:false,
  boxZoom:false,
  keyboard:false,
  tap:true,
  attributionControl:false
}).setView([GYM_LAT,GYM_LNG],ZOOM);
L.tileLayer('${tile}',{maxZoom:19,subdomains:'abcd'}).addTo(map);

var people=L.layerGroup().addTo(map);
L.circleMarker([GYM_LAT,GYM_LNG],{
  radius:46,
  stroke:true,
  color:'rgba(104,88,168,0.5)',
  weight:1.5,
  fillColor:'rgba(42,24,112,0.22)',
  fillOpacity:1
}).addTo(map);

function escHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function arenaPresenceIcon(avatarUrl,displayName,isSelf){
  var size=isSelf?40:34, inner=size-6;
  var border=isSelf?'3px solid #FBBF24':'2.5px solid rgba(255,255,255,0.95)';
  var shadow=isSelf?'0 0 14px rgba(251,191,36,0.55)':'0 2px 10px rgba(0,0,0,.45)';
  var url=avatarUrl&&String(avatarUrl).trim();
  var body;
  if(url){
    body='<img src="'+escAttr(url)+'" alt="" style="width:'+inner+'px;height:'+inner+'px;border-radius:50%;object-fit:cover;display:block" draggable="false"/>';
  }else{
    var ch='?';
    if(displayName&&String(displayName).trim())ch=String(displayName).trim().charAt(0).toUpperCase();
    body='<div style="width:'+inner+'px;height:'+inner+'px;border-radius:50%;background:'+PIN+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;font-family:system-ui,sans-serif">'+escHtml(ch)+'</div>';
  }
  var h='<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;border:'+border+';box-shadow:'+shadow+';overflow:hidden;background:#141018;display:flex;align-items:center;justify-content:center">'+body+'</div>';
  return L.divIcon({className:'presence-peer-marker',html:h,iconSize:[size,size],iconAnchor:[size/2,size/2]});
}
window.setArenaPeople=function(encoded){
  try{
    var list=JSON.parse(decodeURIComponent(encoded));
    if(!Array.isArray(list))return;
    people.clearLayers();
    for(var i=0;i<list.length;i++){
      var p=list[i];
      if(p.lat==null||p.lng==null||!p.userId)continue;
      var self=!!p.isSelf;
      var ic=arenaPresenceIcon(p.avatarUrl||'',p.displayName||'',self);
      var mk=L.marker([p.lat,p.lng],{icon:ic,zIndexOffset:self?950:850});
      (function(uid, isSelfPin){
        mk.on('click',function(ev){
          if(L.DomEvent&&L.DomEvent.stopPropagation)L.DomEvent.stopPropagation(ev);
          if(isSelfPin)return;
          if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'presencePinTap',userId:uid}));
          }
        });
      })(p.userId,self);
      mk.addTo(people);
    }
  }catch(e){}
};
window.__invalidateArenaMap=function(){try{map.invalidateSize();}catch(e){}};
map.whenReady(function(){
  requestAnimationFrame(function(){ window.__invalidateArenaMap(); });
  setTimeout(function(){ window.__invalidateArenaMap(); },160);
});
<\/script></body></html>`
}

export default function GymArenaScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'
  const insets = useSafeAreaInsets()
  const { session, profile } = useAuthContext()
  const webRef = useRef<WebView>(null)
  const params = useLocalSearchParams<{
    gymId?: string
    gymName?: string
    gymAddress?: string
    lat?: string
    lng?: string
    imageUrl?: string
  }>()

  const gymId = params.gymId ?? ''
  const [gym, setGym] = useState<Gym | null>(null)
  const [presence, setPresence] = useState<PresenceRow[]>([])
  const [loading, setLoading] = useState(true)
  /** Your current GPS for arena pin (others use their stored check-in coords). */
  const [liveSelfCoords, setLiveSelfCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!gymId) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const g = await fetchGymById(gymId)
        if (!cancelled) setGym(g)
      } catch {
        if (!cancelled) setGym(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gymId])

  useEffect(() => {
    if (!gymId || !session) return
    const unsub = subscribeToPresence(gymId, setPresence)
    void getActivePresence(gymId).then(setPresence).catch(() => {})
    return unsub
  }, [gymId, session])

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }, [])

  useEffect(() => {
    if (!coordsOk) return
    let alive = true
    ;(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status !== 'granted') return
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (!alive) return
        setLiveSelfCoords({ lat: p.coords.latitude, lng: p.coords.longitude })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      alive = false
    }
  }, [coordsOk])

  const displayName = gym?.name ?? params.gymName ?? 'Gym'
  const displayAddress = gym?.address ?? params.gymAddress ?? ''

  const gymLat = gym?.lat ?? Number.parseFloat(params.lat ?? '')
  const gymLng = gym?.lng ?? Number.parseFloat(params.lng ?? '')
  const coordsOk = Number.isFinite(gymLat) && Number.isFinite(gymLng)

  const pins = useMemo(() => {
    if (!session?.user?.id) return []
    return buildPresencePins(
      presence,
      session.user.id,
      profile?.display_name ?? null,
      profile?.avatar_url ?? null,
    )
  }, [presence, session?.user?.id, profile?.display_name, profile?.avatar_url])

  const othersCount = Math.max(0, pins.filter((p) => !p.isSelf).length)

  const rowsByUserId = useMemo(() => {
    const m = new Map<string, PresenceRow>()
    for (const r of presence) m.set(r.user_id, r)
    return m
  }, [presence])

  const markerPayload = useMemo(() => {
    if (!coordsOk || pins.length === 0) return []

    const rowHasCoords = (r: PresenceRow | undefined) =>
      !!r &&
      typeof r.check_in_lat === 'number' &&
      typeof r.check_in_lng === 'number' &&
      Number.isFinite(r.check_in_lat) &&
      Number.isFinite(r.check_in_lng)

    const needsFallbackSlot: typeof pins = []
    for (const p of pins) {
      if (p.isSelf && liveSelfCoords) continue
      const r = rowsByUserId.get(p.userId)
      if (!rowHasCoords(r)) needsFallbackSlot.push(p)
    }

    const slots = geoSlotsForPins(needsFallbackSlot.length, gymLat, gymLng)
    const slotByUserId = new Map<string, { lat: number; lng: number }>()
    needsFallbackSlot.forEach((p, i) => {
      const s = slots[i]
      if (s) slotByUserId.set(p.userId, s)
    })

    return pins.map((p) => {
      let lat: number
      let lng: number
      if (p.isSelf && liveSelfCoords) {
        lat = liveSelfCoords.lat
        lng = liveSelfCoords.lng
      } else {
        const r = rowsByUserId.get(p.userId)
        if (rowHasCoords(r)) {
          lat = r!.check_in_lat!
          lng = r!.check_in_lng!
        } else {
          const s = slotByUserId.get(p.userId) ?? { lat: gymLat, lng: gymLng }
          lat = s.lat
          lng = s.lng
        }
      }
      return {
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl ?? '',
        isSelf: p.isSelf,
        lat,
        lng,
      }
    })
  }, [pins, coordsOk, gymLat, gymLng, rowsByUserId, liveSelfCoords])

  const arenaHtml = useMemo(() => {
    if (!coordsOk) return ''
    return buildArenaMapHTML(gymLat, gymLng, isDark)
  }, [coordsOk, gymLat, gymLng, isDark])

  const injectMarkers = useCallback(() => {
    if (!coordsOk) return
    const enc = encodeURIComponent(JSON.stringify(markerPayload))
    webRef.current?.injectJavaScript(`try{window.setArenaPeople(${JSON.stringify(enc)});}catch(e){};true;`)
  }, [coordsOk, markerPayload])

  useEffect(() => {
    injectMarkers()
  }, [injectMarkers])

  const handleWebMessage = useCallback((ev: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data) as { type?: string; userId?: string }
      if (msg.type === 'presencePinTap' && msg.userId) {
        router.push({ pathname: '/friend-profile', params: { id: msg.userId } })
      }
    } catch {
      /* ignore */
    }
  }, [])

  const handleClose = useCallback(() => {
    router.back()
  }, [])

  const handleLogWorkout = useCallback(async () => {
    if (!gymId || !session || !profile) {
      Alert.alert('Sign in required', 'Log in to log a workout.')
      return
    }
    let checkInLat: number | undefined
    let checkInLng: number | undefined
    try {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (status === 'granted') {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        checkInLat = p.coords.latitude
        checkInLng = p.coords.longitude
      }
    } catch {
      /* optional */
    }
    try {
      await checkIn({
        userId: session.user.id,
        gymId,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        streak: profile.streak ?? 0,
        shareWithOthers: profile.location_visible ?? false,
        checkInLat,
        checkInLng,
      })
    } catch {
      Alert.alert('Check-in failed', 'Could not verify you at this gym. Try again.')
      return
    }
    router.push({
      pathname: '/log-workout',
      params: { gymId, gymName: displayName },
    })
  }, [gymId, session, profile, displayName])

  if (!gymId) {
    return (
      <View style={[styles.fill, { backgroundColor: BrandViolet.shadow, paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <Pressable onPress={handleClose} style={[styles.closeBtn, { top: insets.top + 8 }]}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <View style={styles.centerMsg}>
          <ThemedText style={{ color: colors.textMuted }}>Missing gym.</ThemedText>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={[styles.fill, { backgroundColor: BrandViolet.shadow, paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={BrandViolet.highlight} style={{ marginTop: WIN_H * 0.4 }} />
      </View>
    )
  }

  return (
    <View style={styles.fill}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[BrandViolet.deep, '#06020E', BrandViolet.shadow]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(104,88,168,0.35)', 'transparent', 'rgba(42,24,112,0.25)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Pressable
        onPress={handleClose}
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        accessibilityLabel="Close"
      >
        <View style={styles.closeInner}>
          <Ionicons name="chevron-down" size={26} color="#E8E4F0" />
        </View>
      </Pressable>

      <Animated.View entering={FadeInDown.duration(520)} style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <ThemedText style={styles.kicker}>{`You're here`}</ThemedText>
        <ThemedText style={styles.title} numberOfLines={2}>
          {displayName}
        </ThemedText>
        {displayAddress ? (
          <ThemedText style={styles.subtitle} numberOfLines={2}>
            {displayAddress}
          </ThemedText>
        ) : null}
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <ThemedText style={styles.liveLabel}>
            {othersCount === 0
              ? 'No one else visible here'
              : `${othersCount} other ${othersCount === 1 ? 'person' : 'people'} checked in`}
          </ThemedText>
        </View>
      </Animated.View>

      <View style={styles.mapSection}>
        {!coordsOk ? (
          <View style={[styles.mapFallback, { borderColor: 'rgba(255,255,255,0.12)' }]}>
            <Ionicons name="map-outline" size={40} color={BrandViolet.highlight} />
            <ThemedText style={styles.mapFallbackText}>
              {`We don't have map coordinates for this place yet.`}
            </ThemedText>
          </View>
        ) : (
          <View style={[styles.mapFrame, { borderColor: 'rgba(255,255,255,0.1)' }]}>
            <WebView
              ref={webRef}
              style={styles.webview}
              originWhitelist={['*']}
              source={{ html: arenaHtml }}
              scrollEnabled={false}
              bounces={false}
              javaScriptEnabled
              onMessage={handleWebMessage}
              onLoadEnd={() => {
                injectMarkers()
                webRef.current?.injectJavaScript(
                  'try{setTimeout(function(){if(window.__invalidateArenaMap)window.__invalidateArenaMap();},100);}catch(e){};true;',
                )
              }}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(6,2,14,0.5)', 'transparent', 'transparent', 'rgba(6,2,14,0.35)']}
              locations={[0, 0.12, 0.88, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
        <ThemedText style={styles.mapCaption}>
          {`Zoomed map · Pins use each person's check-in GPS when available`}
        </ThemedText>
      </View>

      <Animated.View
        entering={FadeInDown.duration(450).delay(200)}
        style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}
      >
        <Pressable
          onPress={handleLogWorkout}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: BrandViolet.primary, opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Ionicons name="camera" size={22} color="#fff" />
          <ThemedText style={styles.ctaText}>Log workout</ThemedText>
        </Pressable>
        <ThemedText style={[styles.footerHint, { color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.5)' }]}>
          Tap a pin on the map for their profile · Use the button above to return to the map
        </ThemedText>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centerMsg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  closeBtn: {
    position: 'absolute',
    left: 12,
    zIndex: 20,
    padding: 8,
  },
  closeInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 6,
    alignItems: 'center',
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: BrandViolet.highlight,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F5F3FF',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(232,228,240,0.65)',
    textAlign: 'center',
    maxWidth: WIN_W - 48,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
    shadowColor: '#34D399',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    ...Platform.select({ android: { elevation: 2 } }),
  },
  liveLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(232,228,240,0.85)',
  },
  mapSection: {
    flex: 1,
    marginTop: 4,
    minHeight: WIN_H * 0.36,
  },
  mapFrame: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  mapFallback: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  mapFallbackText: {
    color: 'rgba(232,228,240,0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  mapCaption: {
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 28,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(200,192,220,0.65)',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16 },
      android: { elevation: 6 },
    }),
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footerHint: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
})
