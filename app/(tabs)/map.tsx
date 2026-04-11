import Ionicons from '@expo/vector-icons/Ionicons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { MapGymBottomSheet, type MapGymSheetPin } from '@/components/map-gym-bottom-sheet'
import { MapGymNoticeOverlay, type MapGymNoticeVariant } from '@/components/map-gym-notice-overlay'
import { ThemedText } from '@/components/themed-text'
import { BrandViolet, Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  distanceMeters,
  ensureGymFromOsmInSupabase,
  fetchGymById,
  findGymIdByOsm,
  getNearbyGyms,
  MANUAL_MAP_CHECKIN_RADIUS_FT,
  MANUAL_MAP_CHECKIN_RADIUS_M,
  resolveGymIdFromList,
  type Gym,
} from '@/lib/gym-service'
import { getGhostPresenceNearUser, getPresenceCountsForGymIds } from '@/lib/presence-map-helpers'
import { buildUpliftMapLeafletHTML } from '@/lib/uplift-map-leaflet-html'
import {
  checkIn,
  checkOut,
  getActivePresence,
  subscribeToPresence,
  type PresenceRow,
} from '@/lib/presence-service'

/** Base radius (m). GPS + building centroid error often exceeds 15m; we add accuracy slack in the poll. */
const ACTIVE_RADIUS_M = 72
const GHOST_RADIUS_M = 2000
const PROXIMITY_ARENA_DELAY_MS = 1200

/**
 * Dev-only: synthetic gym at your GPS for map / check-in / proximity QA.
 * Set to `false` (or remove) before shipping; `__pinTestGym` stays in WebView unused.
 */
const TEMP_QA_GYM_AT_GPS = __DEV__
const QA_TEST_GYM_OSM_ID = 'UPLIFT_DEV_TEST'

/** Stable boot center embedded in WebView HTML so `source` never changes when GPS updates (no full reload). */
const MAP_BOOT_CENTER = { lat: 40.1028, lng: -88.2272 }
const MAP_LAST_CAMERA_KEY = 'uplift_map_last_camera_v1'
const MAP_GYM_SNAPSHOT_KEY = 'uplift_map_gym_snapshot_v1'
const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 18
const SNAPSHOT_MAX_DISTANCE_M = 55_000

type GymSnapItem = {
  gymOsmType: string
  gymOsmId: string
  lat: number
  lng: number
  tagsJson: string
}

/** Spread peer markers in a small ring so stacked check-ins stay tappable. */
function peerOffsetsAroundGym(lat: number, lng: number, count: number, ringMeters = 14) {
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
const PRIVACY_SHOWN_KEY = 'gym_privacy_prompt_shown'

function webOsmKeyFromGym(g: Gym): string {
  const raw = (g.osm_id ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('-')) return raw
  return `node-${raw}`
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
  const activeGymRef = useRef<Gym | null>(null)
  const enterGymRef = useRef<(gym: Gym) => Promise<void>>(async () => {})
  const leaveGymRef = useRef<() => Promise<void>>(async () => {})
  const unsubRef = useRef<(() => void) | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const proximityArenaDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHapticGymRef = useRef<string | null>(null)
  const checkedInGymRef = useRef<string | null>(null)
  const notifiedGymRef = useRef<string | null>(null)

  const [perm, setPerm] = useState<boolean | null>(null)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const [gyms, setGyms] = useState<Gym[]>([])
  const [activeGym, setActiveGym] = useState<Gym | null>(null)
  /** Only after a successful check-in at `activeGym` — peer pins stay hidden until then. */
  const [mapPresenceGymId, setMapPresenceGymId] = useState<string | null>(null)
  const [presenceList, setPresenceList] = useState<PresenceRow[]>([])
  const [showPrivacy, setShowPrivacy] = useState(false)
  /** After the user leaves this tab once, the next focus should refetch pins (WebView stays mounted). */
  const mapTabWasBlurredRef = useRef(false)

  const [gymSheetVisible, setGymSheetVisible] = useState(false)
  const [gymSheetPin, setGymSheetPin] = useState<MapGymSheetPin | null>(null)
  const [gymSheetPresence, setGymSheetPresence] = useState<PresenceRow[]>([])
  const [gymSheetLoading, setGymSheetLoading] = useState(false)
  const [gymSheetDistanceM, setGymSheetDistanceM] = useState<number | null>(null)
  const [gymSheetNotice, setGymSheetNotice] = useState<{
    title: string
    message: string
    variant?: MapGymNoticeVariant
  } | null>(null)

  const [proximityToast, setProximityToast] = useState<string | null>(null)
  const toastOpacity = useSharedValue(0)

  useEffect(() => {
    gymsRef.current = gyms
  }, [gyms])

  useEffect(() => {
    activeGymRef.current = activeGym
  }, [activeGym])

  useEffect(() => {
    if (!session) setMapPresenceGymId(null)
  }, [session])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(MAP_LAST_CAMERA_KEY)
        if (!alive || !raw) return
        const j = JSON.parse(raw) as { lat: number; lng: number }
        if (Number.isFinite(j.lat) && Number.isFinite(j.lng)) {
          coordsRef.current = { lat: j.lat, lng: j.lng }
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Safe-area vars in the embedded HTML are unused; keep HTML string stable so insets changes never remount WebView.
  const mapHtml = useMemo(() => buildUpliftMapLeafletHTML(0, 0), [])

  const mapInjectedBeforeLoad = useMemo(() => {
    const cfg = {
      mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '',
      mapboxStylePath: process.env.EXPO_PUBLIC_MAPBOX_STYLE_PATH ?? 'mapbox/dark-v11',
      theme: isDark ? 'dark' : 'light',
    }
    return `window.__UPLIFT_MAP_CFG=${JSON.stringify(cfg)};true;`
  }, [isDark])

  const injectQaTestGymPin = useCallback((lat: number, lng: number) => {
    if (!TEMP_QA_GYM_AT_GPS || !webRef.current) return
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    webRef.current.injectJavaScript(
      `try{if(window.__pinTestGym)window.__pinTestGym(${lat},${lng});}catch(e){};true;`,
    )
  }, [])

  /** Move map + user dot; optionally refetch Overpass (full reload) or soft kick only. */
  const syncMapCamera = useCallback(
    (
      lat: number,
      lng: number,
      opts?: { reloadPins?: boolean; persist?: boolean; userDotOnly?: boolean },
    ) => {
      const reloadPins = opts?.reloadPins ?? false
      const persist = opts?.persist ?? true
      const userDotOnly = opts?.userDotOnly ?? false
      coordsRef.current = { lat, lng }
      if (persist) {
        void AsyncStorage.setItem(MAP_LAST_CAMERA_KEY, JSON.stringify({ lat, lng }))
      }
      const js = userDotOnly
        ? `try{if(window.userDot)window.userDot.setLatLng([${lat},${lng}]);if(window.__kickGymLoad)window.__kickGymLoad();}catch(e){};true;`
        : reloadPins
          ? `try{map.setView([${lat},${lng}],14,{animate:false});if(window.userDot)window.userDot.setLatLng([${lat},${lng}]);setTimeout(function(){if(window.reloadGymsFromOverpass)window.reloadGymsFromOverpass();},0);}catch(e){};true;`
          : `try{map.setView([${lat},${lng}],14,{animate:false});if(window.userDot)window.userDot.setLatLng([${lat},${lng}]);if(window.__kickGymLoad)window.__kickGymLoad();}catch(e){};true;`
      webRef.current?.injectJavaScript(js)
    },
    [],
  )

  /** Camera + cached pin paint + soft Overpass kick — never clears layers (avoids empty map after modal close). */
  const runMapPinRestore = useCallback(async (c: { lat: number; lng: number }) => {
    if (!webRef.current) return
    try {
      const rawSnap = await AsyncStorage.getItem(MAP_GYM_SNAPSHOT_KEY)
      if (rawSnap) {
        const snap = JSON.parse(rawSnap) as {
          t: number
          centerLat: number
          centerLng: number
          items: GymSnapItem[]
        }
        if (
          snap.items?.length &&
          Date.now() - snap.t <= SNAPSHOT_MAX_AGE_MS &&
          distanceMeters(c.lat, c.lng, snap.centerLat, snap.centerLng) <= SNAPSHOT_MAX_DISTANCE_M
        ) {
          const pts = snap.items.map((it) => [it.lat, it.lng] as [number, number])
          const skelEnc = encodeURIComponent(JSON.stringify(pts))
          webRef.current?.injectJavaScript(
            `try{window.__addSkeletonLatLngs(${JSON.stringify(skelEnc)});}catch(e){};true;`,
          )
          const enc = encodeURIComponent(JSON.stringify(snap.items))
          webRef.current?.injectJavaScript(
            `try{window.__hydrateSnapshot(${JSON.stringify(enc)});}catch(e){};true;`,
          )
        }
      }
    } catch {
      /* ignore */
    }
    syncMapCamera(c.lat, c.lng, { reloadPins: false, persist: false })
    webRef.current?.injectJavaScript(
      `setTimeout(function(){try{window.__kickGymLoad&&window.__kickGymLoad();}catch(e){}},90);true;`,
    )
    if (TEMP_QA_GYM_AT_GPS) injectQaTestGymPin(c.lat, c.lng)
  }, [syncMapCamera, injectQaTestGymPin])

  const pushMapChromeToWebView = useCallback(() => {
    const t = isDark ? 'dark' : 'light'
    const av = profile?.avatar_url ?? ''
    const nm = profile?.display_name ?? ''
    webRef.current?.injectJavaScript(
      `try{window.__setTheme(${JSON.stringify(t)});window.__updateUserDot(${JSON.stringify(av)},${JSON.stringify(nm)});}catch(e){};true;`,
    )
  }, [isDark, profile?.avatar_url, profile?.display_name])

  useEffect(() => {
    pushMapChromeToWebView()
  }, [pushMapChromeToWebView])

  const injectPresencePeersOnMap = useCallback(
    (gym: Gym, rows: PresenceRow[], currentUserId: string | undefined) => {
      const others = rows.filter((p) => p.user_id !== currentUserId)
      const ring = peerOffsetsAroundGym(gym.lat, gym.lng, others.length)
      const payload = others.map((p, i) => ({
        userId: p.user_id,
        displayName: p.display_name ?? 'Member',
        avatarUrl: p.avatar_url ?? '',
        lat: ring[i]!.lat,
        lng: ring[i]!.lng,
      }))
      const enc = encodeURIComponent(JSON.stringify(payload))
      webRef.current?.injectJavaScript(
        `try{window.setPresencePeers(${JSON.stringify(enc)});}catch(e){};true;`,
      )
    },
    [],
  )

  const openGymArena = useCallback((g: Gym) => {
    router.push({
      pathname: '/gym-arena',
      params: {
        gymId: g.id,
        gymName: g.name,
        gymAddress: g.address ?? '',
        lat: String(g.lat),
        lng: String(g.lng),
        imageUrl: g.image_url ?? '',
      },
    })
  }, [])

  /** Resolve Supabase gym row; if missing, upsert from pin coords + OSM tags (WebView loads pins without RN cache). */
  const mergeGymFromPinIfNeeded = useCallback(
    async (msg: {
      gymOsmType: string
      gymOsmId: string
      lat?: number
      lng?: number
      tagsJson?: string
    }): Promise<Gym | null> => {
      let gymId = resolveGymIdFromList(gymsRef.current, msg.gymOsmType, msg.gymOsmId)
      if (!gymId) gymId = await findGymIdByOsm(msg.gymOsmType, msg.gymOsmId)
      let gym: Gym | null = gymId ? gymsRef.current.find((g) => g.id === gymId) ?? null : null
      if (!gym && gymId) gym = await fetchGymById(gymId)

      const latOk = msg.lat != null && Number.isFinite(msg.lat)
      const lngOk = msg.lng != null && Number.isFinite(msg.lng)
      if (!gym && latOk && lngOk) {
        let tags: Record<string, string> = {}
        try {
          const parsed = JSON.parse(msg.tagsJson || '{}') as unknown
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            tags = parsed as Record<string, string>
          }
        } catch {
          tags = {}
        }
        gym = await ensureGymFromOsmInSupabase({
          osmId: msg.gymOsmId,
          lat: msg.lat!,
          lng: msg.lng!,
          tags,
        })
        if (gym) {
          const added = gym
          setGyms((prev) => (prev.some((x) => x.id === added.id) ? prev : [...prev, added]))
        }
      }
      return gym
    },
    [],
  )

  const handleWebViewMessage = useCallback(
    (ev: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(ev.nativeEvent.data) as
          | {
              type: 'gymPinTap'
              gymOsmType: string
              gymOsmId: string
              lat?: number
              lng?: number
              tagsJson?: string
              name: string
            }
          | { type: 'gymLoadSuccess' }
          | { type: 'presencePinTap'; userId: string }
          | {
              type: 'gymPinSnapshot'
              items: GymSnapItem[]
              centerLat: number
              centerLng: number
            }

        if (msg.type === 'gymPinSnapshot' && Array.isArray(msg.items) && msg.items.length > 0) {
          void AsyncStorage.setItem(
            MAP_GYM_SNAPSHOT_KEY,
            JSON.stringify({
              t: Date.now(),
              centerLat: msg.centerLat,
              centerLng: msg.centerLng,
              items: msg.items.slice(0, 400),
            }),
          )
          return
        }

        if (msg.type === 'gymLoadSuccess') {
          webRef.current?.injectJavaScript(`try{window.__clearSkeletonLayer();}catch(e){};true;`)
          if (TEMP_QA_GYM_AT_GPS) {
            const c = coordsRef.current
            if (c) injectQaTestGymPin(c.lat, c.lng)
          }
          return
        }

        if (msg.type === 'presencePinTap' && msg.userId) {
          router.push({ pathname: '/friend-profile', params: { id: msg.userId } })
          return
        }

        if (msg.type === 'gymPinTap') {
          if (msg.lat == null || msg.lng == null) return
          setGymSheetPin({
            gymOsmType: msg.gymOsmType,
            gymOsmId: msg.gymOsmId,
            lat: msg.lat,
            lng: msg.lng,
            tagsJson: msg.tagsJson ?? '{}',
            name: msg.name,
          })
          setGymSheetVisible(true)
          return
        }
      } catch {
        /* ignore non-JSON posts */
      }
    },
    [injectQaTestGymPin],
  )

  // ---- Permission ----
  useEffect(() => {
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      setPerm(status === 'granted')
    })()
  }, [])

  // After blur (other tab / gym-arena), repaint pins from snapshot + soft kick — do not clear layers (bounds can be invalid briefly).
  useFocusEffect(
    useCallback(() => {
      const c = coordsRef.current ?? MAP_BOOT_CENTER
      const reload = mapTabWasBlurredRef.current
      const id = setTimeout(() => {
        if (!webRef.current) return
        if (reload) {
          void runMapPinRestore(coordsRef.current ?? MAP_BOOT_CENTER)
        } else {
          webRef.current.injectJavaScript(
            `if(window.userDot)window.userDot.setLatLng([${c.lat},${c.lng}]);true;`,
          )
        }
      }, reload ? 80 : 0)
      return () => {
        clearTimeout(id)
        mapTabWasBlurredRef.current = true
      }
    }, [runMapPinRestore]),
  )

  // ---- Location: never blocks the map UI; push camera + pins via inject only ----
  useEffect(() => {
    if (perm === false) return
    let cancelled = false

    const refreshGyms = (lat: number, lng: number) => {
      if (TEMP_QA_GYM_AT_GPS) injectQaTestGymPin(lat, lng)
      getNearbyGyms(lat, lng)
        .then(async (nearby) => {
          if (cancelled) return
          let list = nearby
          if (TEMP_QA_GYM_AT_GPS) {
            const g = await ensureGymFromOsmInSupabase({
              osmId: QA_TEST_GYM_OSM_ID,
              lat,
              lng,
              tags: { name: 'Test gym (QA)', leisure: 'fitness_centre' },
            })
            if (g && !nearby.some((x) => x.id === g.id)) list = [...nearby, g]
          }
          if (!cancelled) setGyms(list)
        })
        .catch(() => {})
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
          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            })
            c = { lat: loc.coords.latitude, lng: loc.coords.longitude }
          } catch {
            /* no fix */
          }
        }

        if (cancelled) return
        if (c) {
          coordsRef.current = c
          syncMapCamera(c.lat, c.lng, { reloadPins: true })
          refreshGyms(c.lat, c.lng)
        }

        try {
          const refined = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          if (cancelled) return
          const r = { lat: refined.coords.latitude, lng: refined.coords.longitude }
          coordsRef.current = r
          const jumpM = c ? distanceMeters(c.lat, c.lng, r.lat, r.lng) : 9999
          if (jumpM > 80) {
            syncMapCamera(r.lat, r.lng, { reloadPins: false })
          } else {
            syncMapCamera(r.lat, r.lng, { reloadPins: false, userDotOnly: true })
          }
          refreshGyms(r.lat, r.lng)
        } catch {
          /* keep first fix */
        }
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [perm, syncMapCamera, injectQaTestGymPin])

  // ---- Privacy prompt (one-time) ----
  useEffect(() => {
    if (!session) return
    AsyncStorage.getItem(PRIVACY_SHOWN_KEY).then((v) => {
      if (!v) setShowPrivacy(true)
    })
  }, [session])

  // ---- Enter / leave helpers ----
  const enterGym = useCallback(async (gym: Gym) => {
    if (!session || !profile) return
    setMapPresenceGymId(null)
    unsubRef.current?.()
    unsubRef.current = subscribeToPresence(gym.id, setPresenceList)
    try {
      setPresenceList(await getActivePresence(gym.id))
    } catch {}
    try {
      const c = coordsRef.current
      await checkIn({
        userId: session.user.id,
        gymId: gym.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        streak: profile.streak ?? 0,
        shareWithOthers: profile.location_visible ?? false,
        checkInLat: c?.lat,
        checkInLng: c?.lng,
      })
      checkedInGymRef.current = gym.id
      setMapPresenceGymId(gym.id)
    } catch {
      /* network / RLS */
    }
  }, [session, profile])

  const leaveGym = useCallback(async () => {
    if (checkedInGymRef.current && session) {
      try {
        await checkOut(session.user.id, checkedInGymRef.current)
      } catch {}
      checkedInGymRef.current = null
    }
    unsubRef.current?.()
    unsubRef.current = null
    notifiedGymRef.current = null
    setActiveGym(null)
    setMapPresenceGymId(null)
    setPresenceList([])
    webRef.current?.injectJavaScript(
      `try{window.clearPresencePeers&&window.clearPresencePeers();}catch(e){};true;`,
    )
  }, [session])

  enterGymRef.current = enterGym
  leaveGymRef.current = leaveGym

  useEffect(() => {
    if (!gymSheetVisible || !gymSheetPin) {
      setGymSheetPresence([])
      setGymSheetLoading(false)
      return
    }
    let alive = true
    setGymSheetLoading(true)
    ;(async () => {
      const gym = await mergeGymFromPinIfNeeded({
        gymOsmType: gymSheetPin.gymOsmType,
        gymOsmId: gymSheetPin.gymOsmId,
        lat: gymSheetPin.lat,
        lng: gymSheetPin.lng,
        tagsJson: gymSheetPin.tagsJson,
      })
      if (!alive) return
      if (gym) {
        try {
          const rows = await getActivePresence(gym.id)
          if (!alive) return
          setGymSheetPresence(rows)
        } catch {
          setGymSheetPresence([])
        }
      } else {
        setGymSheetPresence([])
      }
      setGymSheetLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [gymSheetVisible, gymSheetPin, mergeGymFromPinIfNeeded])

  useEffect(() => {
    if (!gymSheetVisible || !gymSheetPin) {
      setGymSheetDistanceM(null)
      return
    }
    const c = coordsRef.current
    if (!c) {
      setGymSheetDistanceM(null)
      return
    }
    setGymSheetDistanceM(distanceMeters(c.lat, c.lng, gymSheetPin.lat, gymSheetPin.lng))
  }, [gymSheetVisible, gymSheetPin])

  const completeSheetCheckIn = useCallback(async () => {
    if (!session || !profile || !gymSheetPin) {
      setGymSheetNotice({
        title: 'Sign in required',
        message: 'Log in to check in at a gym.',
        variant: 'default',
      })
      return
    }
    const gym = await mergeGymFromPinIfNeeded({
      gymOsmType: gymSheetPin.gymOsmType,
      gymOsmId: gymSheetPin.gymOsmId,
      lat: gymSheetPin.lat,
      lng: gymSheetPin.lng,
      tagsJson: gymSheetPin.tagsJson,
    })
    if (!gym) {
      setGymSheetNotice({
        title: 'Could not check in',
        message: 'We could not save this gym to your account. Check your connection and try again.',
        variant: 'error',
      })
      return
    }
    const c = coordsRef.current
    if (!c) {
      setGymSheetNotice({
        title: 'Location needed',
        message: 'We could not read your position. Enable location and try again.',
        variant: 'warning',
      })
      return
    }
    const d = distanceMeters(c.lat, c.lng, gym.lat, gym.lng)
    if (d > MANUAL_MAP_CHECKIN_RADIUS_M) {
      setGymSheetNotice({
        title: 'Too far away',
        message: `Move within about ${MANUAL_MAP_CHECKIN_RADIUS_FT} feet of this gym to check in. You are about ${Math.round(d * 3.28084)} feet away.`,
        variant: 'warning',
      })
      return
    }
    setGymSheetVisible(false)
    setGymSheetPin(null)
    setActiveGym(gym)
    await enterGymRef.current(gym)
    openGymArena(gym)
    webRef.current?.injectJavaScript(
      `try{window.recenter(${gym.lat},${gym.lng});}catch(e){};true;`,
    )
  }, [session, profile, gymSheetPin, mergeGymFromPinIfNeeded, openGymArena])

  useEffect(() => {
    if (!gyms.length) return
    let cancelled = false
    ;(async () => {
      try {
        const counts = await getPresenceCountsForGymIds(gyms.map((g) => g.id))
        if (cancelled) return
        const mapCounts: Record<string, number> = {}
        for (const g of gyms) {
          const n = counts[g.id] ?? 0
          const k = webOsmKeyFromGym(g)
          if (k) mapCounts[k] = Math.max(mapCounts[k] ?? 0, n)
        }
        const enc = encodeURIComponent(JSON.stringify(mapCounts))
        webRef.current?.injectJavaScript(
          `try{window.__applyPresenceToMarkers(${JSON.stringify(enc)});}catch(e){};true;`,
        )
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gyms])

  const ghostSeqRef = useRef(0)
  useEffect(() => {
    if (!perm || activeGym || !session?.user?.id || gyms.length === 0) {
      const emptyEnc = encodeURIComponent(JSON.stringify([]))
      webRef.current?.injectJavaScript(
        `try{window.__setGhostPresence(${JSON.stringify(emptyEnc)});}catch(e){};true;`,
      )
      return
    }
    const c = coordsRef.current
    if (!c) return
    const seq = ++ghostSeqRef.current
    const t = setTimeout(() => {
      void (async () => {
        try {
          const ghosts = await getGhostPresenceNearUser(
            c.lat,
            c.lng,
            gyms,
            GHOST_RADIUS_M,
            session.user.id,
          )
          if (seq !== ghostSeqRef.current) return
          const payload = ghosts.map((g) => ({
            lat: g.lat,
            lng: g.lng,
            avatars: g.avatarUrls,
          }))
          const enc = encodeURIComponent(JSON.stringify(payload))
          webRef.current?.injectJavaScript(
            `try{window.__setGhostPresence(${JSON.stringify(enc)});}catch(e){};true;`,
          )
        } catch {
          /* ignore */
        }
      })()
    }, 500)
    return () => {
      clearTimeout(t)
    }
  }, [perm, activeGym, session?.user?.id, gyms])

  useEffect(() => {
    toastOpacity.value = withTiming(proximityToast ? 1 : 0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    })
  }, [proximityToast, toastOpacity])

  const proximityToastStyle = useAnimatedStyle(() => ({ opacity: toastOpacity.value }))

  // Live peer avatars on the map only after this user has successfully checked in here.
  useEffect(() => {
    if (!activeGym || !session?.user?.id || mapPresenceGymId !== activeGym.id) {
      webRef.current?.injectJavaScript(
        `try{window.clearPresencePeers&&window.clearPresencePeers();}catch(e){};true;`,
      )
      return
    }
    injectPresencePeersOnMap(activeGym, presenceList, session.user.id)
  }, [activeGym, presenceList, session?.user?.id, mapPresenceGymId, injectPresencePeersOnMap])

  // ---- Proximity polling (adaptive interval + haptic + delayed arena) ----
  useEffect(() => {
    if (!perm || gyms.length === 0) return
    let cancelled = false

    const minDistToAnyGym = (lat: number, lng: number) => {
      let m = Infinity
      for (const gym of gymsRef.current) {
        m = Math.min(m, distanceMeters(lat, lng, gym.lat, gym.lng))
      }
      return m
    }

    const nextDelay = (lat: number, lng: number) => {
      const m = minDistToAnyGym(lat, lng)
      if (m < 500) return 3000
      if (m > 4000) return 20000
      return 10000
    }

    const run = async () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
      try {
        const cr = coordsRef.current
        const nearGym =
          cr != null && gymsRef.current.length > 0 ? minDistToAnyGym(cr.lat, cr.lng) < 650 : false
        const loc = await Location.getCurrentPositionAsync({
          accuracy: nearGym ? Location.Accuracy.High : Location.Accuracy.Balanced,
        })
        const c = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        coordsRef.current = c

        webRef.current?.injectJavaScript(
          `if(window.userDot)window.userDot.setLatLng([${c.lat},${c.lng}]);true;`,
        )

        let closest: Gym | null = null
        let closestDist = Infinity
        for (const gym of gymsRef.current) {
          const d = distanceMeters(c.lat, c.lng, gym.lat, gym.lng)
          if (d < closestDist) {
            closestDist = d
            closest = gym
          }
        }

        const acc = loc.coords.accuracy ?? 45
        const thresholdM = Math.min(ACTIVE_RADIUS_M + Math.min(acc, 72), 150)

        if (closest && closestDist <= thresholdM) {
          if (lastHapticGymRef.current !== closest.id) {
            lastHapticGymRef.current = closest.id
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          }
          if (activeGymRef.current?.id !== closest.id) {
            const g = closest
            setActiveGym(g)
            await enterGymRef.current(g)
            if (notifiedGymRef.current !== g.id) {
              notifiedGymRef.current = g.id
              const osmKey = webOsmKeyFromGym(g)
              if (osmKey) {
                webRef.current?.injectJavaScript(
                  `try{window.__highlightGymForArena(${JSON.stringify(osmKey)});}catch(e){};true;`,
                )
              }
              setProximityToast(`You're at ${g.name}`)
              if (proximityArenaDelayRef.current) clearTimeout(proximityArenaDelayRef.current)
              proximityArenaDelayRef.current = setTimeout(() => {
                setProximityToast(null)
                openGymArena(g)
                proximityArenaDelayRef.current = null
              }, PROXIMITY_ARENA_DELAY_MS)
            }
          }
        } else {
          lastHapticGymRef.current = null
          if (proximityArenaDelayRef.current) {
            clearTimeout(proximityArenaDelayRef.current)
            proximityArenaDelayRef.current = null
          }
          setProximityToast(null)
          if (activeGymRef.current) {
            void leaveGymRef.current()
          }
          notifiedGymRef.current = null
        }
      } catch {
        /* retry */
      } finally {
        if (cancelled) return
        const cr = coordsRef.current
        const delay = cr && gymsRef.current.length ? nextDelay(cr.lat, cr.lng) : 20000
        pollTimeoutRef.current = setTimeout(run, delay)
      }
    }

    void run()
    return () => {
      cancelled = true
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
      if (proximityArenaDelayRef.current) clearTimeout(proximityArenaDelayRef.current)
    }
  }, [perm, gyms.length, openGymArena])

  // ---- Cleanup ----
  useEffect(() => () => {
    unsubRef.current?.()
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
  }, [])

  // ---- Handlers ----
  const handlePrivacy = async (on: boolean) => {
    await AsyncStorage.setItem(PRIVACY_SHOWN_KEY, 'true')
    setShowPrivacy(false)
    if (on) await updateProfile({ location_visible: true })
  }

  const handleRecenter = () => {
    const c = coordsRef.current
    if (!c || !webRef.current) return
    webRef.current.injectJavaScript(`window.recenter(${c.lat},${c.lng});true;`)
  }

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Map — always mounted when location allowed; WebView HTML stays stable for instant tab switches */}
      <WebView
        ref={webRef}
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: isDark ? '#000000' : '#d4d4d4' },
        ]}
        originWhitelist={['*']}
        source={{ html: mapHtml }}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        {...Platform.select({
          android: {
            androidLayerType: 'hardware' as const,
            nestedScrollEnabled: false,
            overScrollMode: 'never' as const,
          },
          ios: { decelerationRate: 'normal' as const },
        })}
        onMessage={handleWebViewMessage}
        onLoadEnd={() => {
          void (async () => {
            let c = coordsRef.current
            try {
              const rawCam = await AsyncStorage.getItem(MAP_LAST_CAMERA_KEY)
              if (rawCam) {
                const j = JSON.parse(rawCam) as { lat: number; lng: number }
                if (Number.isFinite(j.lat) && Number.isFinite(j.lng)) {
                  c = { lat: j.lat, lng: j.lng }
                  coordsRef.current = c
                }
              }
            } catch {
              /* ignore */
            }
            c = c ?? MAP_BOOT_CENTER
            await runMapPinRestore(c)
            pushMapChromeToWebView()
          })()
        }}
        injectedJavaScriptBeforeContentLoaded={mapInjectedBeforeLoad}
      />

      {proximityToast ? (
        <Animated.View style={[styles.proximityToast, { top: insets.top + 12 }, proximityToastStyle]}>
          <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
          <Text style={styles.proximityToastText}>{proximityToast}</Text>
        </Animated.View>
      ) : null}

      <MapGymBottomSheet
        visible={gymSheetVisible && gymSheetPin != null}
        pin={gymSheetPin}
        presence={gymSheetPresence}
        loading={gymSheetLoading}
        distanceToUserM={gymSheetDistanceM}
        manualCheckInMaxM={MANUAL_MAP_CHECKIN_RADIUS_M}
        onClose={() => {
          setGymSheetVisible(false)
          setGymSheetPin(null)
        }}
        onCheckIn={() => {
          void completeSheetCheckIn()
        }}
      />

      <MapGymNoticeOverlay
        visible={gymSheetNotice != null}
        title={gymSheetNotice?.title ?? ''}
        message={gymSheetNotice?.message ?? ''}
        variant={gymSheetNotice?.variant ?? 'default'}
        onDismiss={() => setGymSheetNotice(null)}
      />

      {/* Who's here — zoomed gym map + people (checked in) */}
      {activeGym ? (
        <Pressable
          onPress={() => openGymArena(activeGym)}
          style={[
            styles.fab,
            {
              top: insets.top + 12,
              left: 16,
              right: undefined,
              backgroundColor: BrandViolet.primary,
              zIndex: 2,
            },
          ]}
          accessibilityLabel="See who is checked in at this gym"
        >
          <Ionicons name="people" size={20} color="#fff" />
        </Pressable>
      ) : null}

      {/* Recenter */}
      <Pressable
        onPress={handleRecenter}
        style={[styles.fab, { top: insets.top + 12, backgroundColor: colors.card, zIndex: 2 }]}
      >
        <Ionicons name="navigate" size={20} color={colors.text} />
      </Pressable>

      {/* Bottom hint */}
      <View style={styles.hintWrap} pointerEvents="none">
        <View style={[styles.hintPill, { backgroundColor: colors.card }]}>
          {activeGym ? (
            <>
              <Ionicons name="people" size={16} color={BrandViolet.primary} />
              <ThemedText style={[styles.hintText, { color: colors.textMuted }]}>
                Tap people for gym map & log workout
              </ThemedText>
            </>
          ) : (
            <>
              <Ionicons name="walk-outline" size={16} color={colors.textMuted} />
              <ThemedText style={[styles.hintText, { color: colors.textMuted }]}>
                Get near a gym or tap a pin → Check in here
              </ThemedText>
            </>
          )}
        </View>
      </View>

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
              {`Let friends see when you're at the same gym. You can change this anytime in Settings.`}
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

  proximityToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(12,10,18,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  proximityToastText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
})
