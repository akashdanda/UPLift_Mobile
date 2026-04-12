import Constants from 'expo-constants'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, View, type AppStateStatus } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { fetchMinimumNativeVersion } from '@/lib/app-version-policy'

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

/** Returns -1 if a<b, 0 if a==b, 1 if a>b */
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

function maxVersionString(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return compareVersions(a, b) >= 0 ? a : b
}

async function lookupLatestItunesVersion(bundleId: string): Promise<{ latestVersion: string; trackViewUrl: string } | null> {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=us`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

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

/** iOS only: blocks the app when the installed build is below App Store / policy minimum. */
export function RequiredUpdateGate() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const bundleId = useMemo(() => {
    return (
      (Constants.expoConfig as { ios?: { bundleIdentifier?: string } })?.ios?.bundleIdentifier ||
      (Constants.expoConfig as { bundleIdentifier?: string })?.bundleIdentifier ||
      'com.akashdanda.uplift'
    )
  }, [])

  const currentVersion = useMemo(() => {
    return (
      (Constants.expoConfig as { version?: string })?.version ??
      (Constants.manifest as { version?: string } | null)?.version ??
      null
    )
  }, [])

  const embeddedMinimumVersion = useMemo(() => {
    const v = (Constants.expoConfig as { extra?: { minimumNativeVersion?: string } })?.extra?.minimumNativeVersion
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
  }, [])

  const [visible, setVisible] = useState(false)
  const [storeUrl, setStoreUrl] = useState<string | null>(null)

  const evaluate = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setVisible(false)
      return
    }

    if (!currentVersion) {
      setVisible(false)
      return
    }

    const minFromServer = await fetchMinimumNativeVersion().catch(() => null)
    const policyMin = maxVersionString(minFromServer, embeddedMinimumVersion)

    const lookup = await lookupLatestItunesVersion(bundleId)
    const itunesLatest = lookup?.latestVersion ?? null
    const iosStoreUrl = lookup?.trackViewUrl ?? null

    const effectiveMin = maxVersionString(policyMin, itunesLatest)
    const mustUpdate = effectiveMin != null && compareVersions(currentVersion, effectiveMin) < 0

    setStoreUrl(iosStoreUrl)
    setVisible(mustUpdate && iosStoreUrl != null)
  }, [bundleId, currentVersion, embeddedMinimumVersion])

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    void evaluate()
  }, [evaluate])

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void evaluate()
      }
    })
    return () => sub.remove()
  }, [evaluate])

  const onUpdatePress = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch(() => {})
    }
  }

  if (Platform.OS !== 'ios') return null
  if (!visible) return null

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => {}}
    >
      <View style={[styles.overlay, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
          <ThemedText type="subtitle" style={[styles.title, { color: colors.text }]}>
            Update required
          </ThemedText>

          <ThemedText style={[styles.body, { color: colors.textMuted }]}>
            This version of Uplift is no longer supported. Install the latest update to continue.
          </ThemedText>

          <Pressable style={[styles.button, { backgroundColor: colors.tint }]} onPress={onUpdatePress}>
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
