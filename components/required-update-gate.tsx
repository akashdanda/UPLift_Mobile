import Constants from 'expo-constants'
import { useEffect, useMemo, useState } from 'react'
import { Linking, Modal, Pressable, Platform, StyleSheet, View } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import AsyncStorage from '@react-native-async-storage/async-storage'

type ItunesLookupResult = {
  version?: string
  trackViewUrl?: string
}

function normalizeVersionParts(v: string): number[] {
  return v
    .trim()
    .split('.')
    .map((p) => Number(p))
    .filter((n) => !Number.isNaN(n))
}

// Returns -1 if a<b, 0 if a==b, 1 if a>b
function compareVersions(aRaw: string, bRaw: string): number {
  const a = normalizeVersionParts(aRaw)
  const b = normalizeVersionParts(bRaw)
  const len = Math.max(a.length, b.length, 3)

  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    if (ai < bi) return -1
    if (ai > bi) return 1
  }
  return 0
}

async function lookupLatestItunesVersion(bundleId: string): Promise<{ latestVersion: string; trackViewUrl: string } | null> {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=us`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const json = (await res.json()) as { resultCount?: number; results?: ItunesLookupResult[] }
    const item = json.results?.[0]
    const latestVersion = item?.version
    const trackViewUrl = item?.trackViewUrl
    if (!latestVersion || !trackViewUrl) return null
    return { latestVersion, trackViewUrl }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const LAST_FORCED_VERSION_KEY = 'last_forced_update_version'

export function RequiredUpdateGate() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const bundleId = useMemo(() => {
    return (
      (Constants.expoConfig as any)?.ios?.bundleIdentifier ||
      (Constants.expoConfig as any)?.bundleIdentifier ||
      'com.akashdanda.uplift'
    )
  }, [])

  // `Constants.manifest` is typed as `EmbeddedManifest` (no `version` field),
  // so we cast for a safe fallback in environments where `expoConfig` is missing.
  const currentVersion = (Constants.expoConfig as any)?.version ?? (Constants.manifest as any)?.version

  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (!currentVersion) return

    let cancelled = false
    ;(async () => {
      // Prevent showing the same modal repeatedly if user already forced-updated to this version.
      const lastForced = await AsyncStorage.getItem(LAST_FORCED_VERSION_KEY)

      const lookup = await lookupLatestItunesVersion(bundleId)
      if (!lookup) {
        if (!cancelled) setChecked(true)
        return
      }

      const { latestVersion } = lookup
      const shouldForce = compareVersions(currentVersion, latestVersion) < 0 && latestVersion !== lastForced

      if (!cancelled) {
        setVisible(shouldForce)
        setChecked(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bundleId, currentVersion])

  const onUpdatePress = async () => {
    if (Platform.OS !== 'ios') return

    const lookup = await lookupLatestItunesVersion(bundleId)
    const latestVersion = lookup?.latestVersion
    const trackViewUrl = lookup?.trackViewUrl
    if (!latestVersion || !trackViewUrl) return

    await AsyncStorage.setItem(LAST_FORCED_VERSION_KEY, latestVersion)
    setVisible(false)
    Linking.openURL(trackViewUrl).catch(() => {})
  }

  if (!visible) return null
  if (!checked) return null

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
          <ThemedText type="subtitle" style={[styles.title, { color: colors.text }]}>
            Update required
          </ThemedText>

          <ThemedText style={[styles.body, { color: colors.textMuted }]}>
            A newer version of Uplift is available. Please update to continue.
          </ThemedText>

          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={onUpdatePress}
          >
            <ThemedText style={styles.buttonText}>Update on the App Store</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
})

