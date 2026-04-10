import Ionicons from '@expo/vector-icons/Ionicons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Linking,
  Modal,
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
import { distanceMeters, getNearbyGyms, type Gym } from '@/lib/gym-service'
import {
  checkIn,
  checkOut,
  getActivePresence,
  subscribeToPresence,
  type PresenceRow,
} from '@/lib/presence-service'
import { Image } from 'expo-image'

const { height: SCREEN_H } = Dimensions.get('window')
const ACTIVE_RADIUS = 50
const POLL_INTERVAL = 15_000
const PRIVACY_SHOWN_KEY = 'gym_privacy_prompt_shown'

function buildMapHTML(lat: number, lng: number, isDark: boolean) {
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  const pinColor = BrandViolet.primary

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  *{margin:0;padding:0}
  html,body,#map{width:100%;height:100%}
  .leaflet-control-attribution{display:none!important}
  .gym-pin{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:800;}
  .loading-indicator{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-family:system-ui;z-index:9999;display:none;}
</style>
</head>
<body>
<div id="map"></div>
<div id="loading" class="loading-indicator">Loading gyms...</div>
<script>
  var map = L.map('map', {zoomControl: false}).setView([${lat}, ${lng}], 14);
  L.tileLayer('${tileUrl}', {maxZoom: 19, subdomains: 'abcd'}).addTo(map);
  L.circleMarker([${lat}, ${lng}], {radius: 7, fillColor: '#4285F4', fillOpacity: 1, color: '#fff', weight: 2}).addTo(map);

  var markers = L.layerGroup().addTo(map);
  var loadedAreas = [];
  var fetchTimer = null;
  var loadingEl = document.getElementById('loading');

  function alreadyLoaded(b) {
    for (var i = 0; i < loadedAreas.length; i++) {
      var a = loadedAreas[i];
      if (b.south >= a.south && b.north <= a.north && b.west >= a.west && b.east <= a.east) return true;
    }
    return false;
  }

  function fetchGyms() {
    var b = map.getBounds();
    var bounds = {south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast()};

    if (alreadyLoaded(bounds)) return;
    if (map.getZoom() < 10) return;

    var cLat = (bounds.south + bounds.north) / 2;
    var cLng = (bounds.west + bounds.east) / 2;
    var latDist = (bounds.north - bounds.south) * 111320;
    var lngDist = (bounds.east - bounds.west) * 111320 * Math.cos(cLat * Math.PI / 180);
    var radius = Math.min(Math.max(latDist, lngDist) / 2, 25000);

    loadingEl.style.display = 'block';

    var query = '[out:json][timeout:25];(' +
      'node["leisure"="fitness_centre"](around:' + radius + ',' + cLat + ',' + cLng + ');' +
      'node["amenity"="gym"](around:' + radius + ',' + cLat + ',' + cLng + ');' +
      'way["leisure"="fitness_centre"](around:' + radius + ',' + cLat + ',' + cLng + ');' +
      'way["amenity"="gym"](around:' + radius + ',' + cLat + ',' + cLng + ');' +
      ');out center;';

    fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        loadedAreas.push({
          south: bounds.south - 0.01,
          north: bounds.north + 0.01,
          west: bounds.west - 0.01,
          east: bounds.east + 0.01
        });

        data.elements.forEach(function(el) {
          var lat = el.lat || (el.center && el.center.lat);
          var lng = el.lon || (el.center && el.center.lon);
          var name = (el.tags && el.tags.name) || 'Gym';
          var addr = (el.tags && el.tags['addr:street']) || '';
          if (!lat || !lng) return;

          var s = 26;
          var html = '<div style="position:relative;width:' + s + 'px;height:' + s + 'px;">' +
            '<div class="gym-pin" style="width:' + s + 'px;height:' + s + 'px;background:${pinColor};box-shadow:0 2px 8px ${pinColor}88;font-size:12px;">💪</div></div>';
          var icon = L.divIcon({className: '', iconSize: [s, s], iconAnchor: [s/2, s/2], html: html});
          L.marker([lat, lng], {icon: icon})
            .bindPopup('<b>' + name.replace(/</g,'&lt;') + '</b>' + (addr ? '<br>' + addr.replace(/</g,'&lt;') : ''))
            .addTo(markers);
        });
        loadingEl.style.display = 'none';
      })
      .catch(function() {
        loadingEl.style.display = 'none';
      });
  }

  map.on('moveend', function() {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(fetchGyms, 500);
  });

  fetchGyms();
<\/script>
</body>
</html>`
}

export default function MapScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'
  const insets = useSafeAreaInsets()
  const { session, profile, updateProfile } = useAuthContext()

  const sheetAnim = useRef(new Animated.Value(0)).current
  const unsubRef = useRef<(() => void) | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkedInGymRef = useRef<string | null>(null)

  const [permGranted, setPermGranted] = useState<boolean | null>(null)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gyms, setGyms] = useState<Gym[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGym, setActiveGym] = useState<Gym | null>(null)
  const [presenceList, setPresenceList] = useState<PresenceRow[]>([])
  const [presenceCounts, setPresenceCounts] = useState<Record<string, number>>({})
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      setPermGranted(status === 'granted')
    })()
  }, [])

  useEffect(() => {
    if (!permGranted) return
    ;(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        console.log('[Map] Got coords:', coords.lat, coords.lng)
        setUserCoords(coords)
        try {
          console.log('[Map] Fetching nearby gyms...')
          const nearby = await getNearbyGyms(coords.lat, coords.lng)
          console.log('[Map] Got', nearby.length, 'gyms')
          setGyms(nearby)
          if (nearby.length === 0) {
            setErrorMsg('No gyms found nearby.')
          }
        } catch (e: any) {
          console.warn('[Map] Gym fetch error:', e?.message ?? e)
          setErrorMsg('Could not load gyms: ' + (e?.message ?? 'Unknown error'))
        }
      } catch (e: any) {
        console.warn('[Map] Location error:', e?.message ?? e)
        setErrorMsg('Could not get your location. Try again.')
      } finally {
        setLoading(false)
      }
    })()
  }, [permGranted])

  useEffect(() => {
    if (!session) return
    AsyncStorage.getItem(PRIVACY_SHOWN_KEY).then((val) => {
      if (!val) setShowPrivacyModal(true)
    })
  }, [session])

  useEffect(() => {
    if (!permGranted || gyms.length === 0) return

    const poll = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        setUserCoords(coords)

        let closest: Gym | null = null
        let closestDist = Infinity
        const counts: Record<string, number> = {}

        for (const gym of gyms) {
          const d = distanceMeters(coords.lat, coords.lng, gym.lat, gym.lng)
          if (d < closestDist) {
            closestDist = d
            closest = gym
          }
        }

        for (const gym of gyms) {
          try {
            const rows = await getActivePresence(gym.id)
            counts[gym.id] = rows.length
          } catch { /* ignore */ }
        }
        setPresenceCounts(counts)

        if (closest && closestDist <= ACTIVE_RADIUS) {
          if (activeGym?.id !== closest.id) {
            setActiveGym(closest)
            handleGymEnter(closest)
          }
        } else if (activeGym) {
          handleGymLeave()
        }
      } catch { /* location unavailable */ }
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [permGranted, gyms.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: activeGym ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start()
  }, [activeGym]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGymEnter = useCallback(
    async (gym: Gym) => {
      if (!session || !profile) return
      unsubRef.current?.()
      unsubRef.current = subscribeToPresence(gym.id, setPresenceList)
      try {
        const rows = await getActivePresence(gym.id)
        setPresenceList(rows)
      } catch { /* ignore */ }
      if (profile.location_visible) {
        try {
          await checkIn({
            userId: session.user.id,
            gymId: gym.id,
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url,
            streak: profile.streak ?? 0,
          })
          checkedInGymRef.current = gym.id
        } catch { /* ignore */ }
      }
    },
    [session, profile],
  )

  const handleGymLeave = useCallback(async () => {
    if (checkedInGymRef.current && session) {
      try {
        await checkOut(session.user.id, checkedInGymRef.current)
      } catch { /* ignore */ }
      checkedInGymRef.current = null
    }
    unsubRef.current?.()
    unsubRef.current = null
    setActiveGym(null)
    setPresenceList([])
  }, [session])

  useEffect(() => {
    return () => {
      unsubRef.current?.()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handlePrivacy = async (turnOn: boolean) => {
    await AsyncStorage.setItem(PRIVACY_SHOWN_KEY, 'true')
    setShowPrivacyModal(false)
    if (turnOn) {
      await updateProfile({ location_visible: true })
    }
  }

  const handlePostFromHere = async () => {
    if (!activeGym) return
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return
    router.push({
      pathname: '/log-workout',
      params: { gymId: activeGym.id, gymName: activeGym.name },
    })
  }

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H * 0.45, 0],
  })

  if (permGranted === false) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="location-outline" size={48} color={colors.textMuted} />
        <ThemedText style={[styles.permTitle, { color: colors.text }]}>
          Location access required
        </ThemedText>
        <ThemedText style={[styles.permBody, { color: colors.textMuted }]}>
          Enable location in your device settings to see nearby gyms.
        </ThemedText>
        <Pressable
          style={[styles.permBtn, { backgroundColor: BrandViolet.primary }]}
          onPress={() => Linking.openSettings()}
        >
          <ThemedText style={styles.permBtnText}>Open Settings</ThemedText>
        </Pressable>
      </View>
    )
  }

  if (loading || permGranted === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    )
  }

  const othersAtGym = presenceList.filter((p) => p.user_id !== session?.user?.id)

  const retryLoadGyms = async () => {
    if (!userCoords) return
    setErrorMsg(null)
    setLoading(true)
    try {
      const nearby = await getNearbyGyms(userCoords.lat, userCoords.lng)
      setGyms(nearby)
      if (nearby.length === 0) setErrorMsg('No gyms found nearby.')
    } catch (e: any) {
      setErrorMsg('Could not load gyms: ' + (e?.message ?? 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {userCoords && (
        <WebView
          style={StyleSheet.absoluteFillObject}
          originWhitelist={['*']}
          source={{
            html: buildMapHTML(userCoords.lat, userCoords.lng, isDark),
          }}
          scrollEnabled={false}
          bounces={false}
          javaScriptEnabled
        />
      )}

      {errorMsg && (
        <Pressable
          style={[styles.toast, { top: insets.top + 8, backgroundColor: colors.card }]}
          onPress={retryLoadGyms}
        >
          <ThemedText style={[styles.toastText, { color: colors.textMuted }]}>
            {errorMsg} — Tap to retry
          </ThemedText>
        </Pressable>
      )}

      {/* Recenter button */}
      {userCoords && (
        <Pressable
          style={[styles.recenterBtn, { top: insets.top + 12, backgroundColor: colors.card }]}
          onPress={() => {
            // WebView doesn't support imperative recenter, so we force a re-render
            setUserCoords({ ...userCoords })
          }}
        >
          <Ionicons name="locate" size={20} color={colors.text} />
        </Pressable>
      )}

      {!activeGym && (
        <View style={styles.hintWrap} pointerEvents="none">
          <ThemedText style={[styles.hintText, { color: colors.textMuted }]}>
            Head to a gym to post
          </ThemedText>
        </View>
      )}

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <View style={styles.sheetHandle}>
          <View style={[styles.handleBar, { backgroundColor: colors.textMuted + '40' }]} />
        </View>

        <ThemedText type="title" style={[styles.sheetTitle, { color: colors.text }]}>
          {activeGym?.name ?? ''}
        </ThemedText>

        {othersAtGym.length > 0 ? (
          <View style={styles.presenceSection}>
            <ThemedText style={[styles.presenceLabel, { color: colors.textMuted }]}>
              Here now
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.avatarRow}
            >
              {othersAtGym.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.avatarItem}
                  onPress={() => {
                    Alert.alert(
                      p.display_name ?? 'User',
                      `🔥 ${p.streak} day streak`,
                      [
                        { text: 'Close', style: 'cancel' },
                        {
                          text: 'View Profile',
                          onPress: () => router.push({ pathname: '/friend-profile', params: { id: p.user_id } }),
                        },
                      ],
                    )
                  }}
                >
                  <View style={[styles.avatarCircle, { backgroundColor: colors.tint + '20' }]}>
                    {p.avatar_url ? (
                      <Image source={{ uri: p.avatar_url }} style={styles.avatarImg} />
                    ) : (
                      <ThemedText style={[styles.avatarInitial, { color: colors.tint }]}>
                        {(p.display_name ?? '?')[0].toUpperCase()}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={[styles.avatarName, { color: colors.textMuted }]} numberOfLines={1}>
                    {p.display_name?.split(' ')[0] ?? 'User'}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : (
          <ThemedText style={[styles.noOneHere, { color: colors.textMuted }]}>
            No one else here right now
          </ThemedText>
        )}

        <Pressable
          style={[styles.postBtn, { backgroundColor: BrandViolet.primary }]}
          onPress={handlePostFromHere}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <ThemedText style={styles.postBtnText}>Post from here</ThemedText>
        </Pressable>
      </Animated.View>

      {/* Privacy modal */}
      <Modal visible={showPrivacyModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Ionicons name="location" size={36} color={BrandViolet.primary} style={styles.modalIcon} />
            <ThemedText type="title" style={[styles.modalTitle, { color: colors.text }]}>
              Show yourself at the gym?
            </ThemedText>
            <ThemedText style={[styles.modalBody, { color: colors.textMuted }]}>
              Let friends see when you're at the same gym. You can change this anytime in Settings.
            </ThemedText>
            <Pressable
              style={[styles.modalPrimary, { backgroundColor: BrandViolet.primary }]}
              onPress={() => handlePrivacy(true)}
            >
              <ThemedText style={styles.modalPrimaryText}>Turn on</ThemedText>
            </Pressable>
            <Pressable style={styles.modalSecondary} onPress={() => handlePrivacy(false)}>
              <ThemedText style={[styles.modalSecondaryText, { color: colors.textMuted }]}>
                Not now
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 },

  permTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  permBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  toastText: { fontSize: 13, textAlign: 'center' },

  recenterBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  hintWrap: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: { fontSize: 14, fontWeight: '500' },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    minHeight: SCREEN_H * 0.3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHandle: { alignItems: 'center', marginBottom: 12 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 22, fontWeight: '800', marginBottom: 16 },

  presenceSection: { marginBottom: 20 },
  presenceLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  avatarRow: { gap: 14, paddingRight: 20 },
  avatarItem: { alignItems: 'center', width: 56 },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarInitial: { fontSize: 18, fontWeight: '700' },
  avatarName: { fontSize: 11, marginTop: 4 },
  noOneHere: { fontSize: 14, marginBottom: 20 },

  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  postBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: { width: '100%', borderRadius: 20, padding: 28, alignItems: 'center' },
  modalIcon: { marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  modalBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  modalPrimary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  modalPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalSecondary: { paddingVertical: 8 },
  modalSecondaryText: { fontSize: 15 },
})
