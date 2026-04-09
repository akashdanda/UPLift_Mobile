import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { setSessionFromRedirectUrl } from '@/lib/auth-oauth'

type Status = 'loading' | 'done' | 'link_error' | 'no_session_hint'

/**
 * Handles Supabase email confirmation & password-recovery redirects.
 * Add `getRedirectUrl()` output to Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export default function AuthCallbackScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const urlFromHook = Linking.useURL()
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const lastProcessedUrl = useRef<string | null>(null)

  const processUrl = useCallback(async (url: string | null) => {
    if (!url) return
    if (lastProcessedUrl.current === url) return
    lastProcessedUrl.current = url

    const { error } = await setSessionFromRedirectUrl(url)
    if (error) {
      setStatus('link_error')
      setMessage(error.message)
      return
    }

    const hasTokens = url.includes('access_token=') && url.includes('refresh_token=')
    if (hasTokens) {
      setStatus('done')
      router.replace('/(tabs)')
      return
    }

    setStatus('no_session_hint')
    setMessage(
      'If you just confirmed your email, your account is ready. Sign in with your email and password.'
    )
  }, [])

  useEffect(() => {
    void (async () => {
      const initial = await Linking.getInitialURL()
      const toUse = urlFromHook ?? initial
      if (toUse) await processUrl(toUse)
    })()
  }, [urlFromHook, processUrl])

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      void processUrl(url)
    })
    return () => sub.remove()
  }, [processUrl])

  useEffect(() => {
    const id = setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'no_session_hint' : s))
    }, 3000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (status !== 'no_session_hint' || message != null) return
    setMessage(
      'Open the confirmation link from your email on this device. If you already confirmed, sign in below.'
    )
  }, [status, message])

  const goLogin = () => router.replace('/login')

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.inner}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.tint} />
            <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>Finishing sign-in…</ThemedText>
          </>
        )}

        {status === 'done' && (
          <>
            <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
              {"You're in"}
            </ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>Opening the app…</ThemedText>
            <ActivityIndicator color={colors.tint} style={{ marginTop: 16 }} />
          </>
        )}

        {status === 'link_error' && (
          <>
            <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
              Link issue
            </ThemedText>
            <ThemedText style={[styles.body, { color: colors.textMuted }]}>
              {message ?? 'This link may be expired or already used.'}
            </ThemedText>
            <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
              If you already tapped confirm, try signing in — your email may already be verified.
            </ThemedText>
            <Pressable style={[styles.btn, { backgroundColor: colors.tint }]} onPress={goLogin}>
              <ThemedText style={styles.btnText}>Go to sign in</ThemedText>
            </Pressable>
          </>
        )}

        {status === 'no_session_hint' && (
          <>
            <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
              Almost there
            </ThemedText>
            <ThemedText style={[styles.body, { color: colors.textMuted }]}>{message}</ThemedText>
            <Pressable style={[styles.btn, { backgroundColor: colors.tint }]} onPress={goLogin}>
              <ThemedText style={styles.btnText}>Go to sign in</ThemedText>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 28, justifyContent: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  hint: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8 },
  btn: { marginTop: 20, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
