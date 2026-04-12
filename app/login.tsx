import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import AppleSignInButton from '@/components/social-auth-buttons/apple-sign-in-button'
import GoogleSignInButton from '@/components/social-auth-buttons/google-sign-in-button'
import { ThemedText } from '@/components/themed-text'
import { BrandViolet, Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function LoginScreen() {
  const { signInWithEmail, resetPassword } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const insets = useSafeAreaInsets()
  const isDark = colorScheme === 'dark'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    setLoading(true)
    const { error } = await signInWithEmail(email, password)
    setLoading(false)
    if (error) {
      Alert.alert('Could not sign in', error.message)
    }
  }

  const handleForgotPassword = async () => {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      Alert.alert('Email required', 'Enter your email above, then tap Forgot password again.')
      return
    }
    setLoading(true)
    const { error } = await resetPassword(trimmed)
    setLoading(false)
    if (error) {
      Alert.alert('Could not send reset email', error.message)
      return
    }
    Alert.alert('Check your email', 'If an account exists for that address, we sent a reset link.')
  }

  const inputSurface = {
    backgroundColor: colors.card,
    borderColor: colors.tabBarBorder,
    borderWidth: StyleSheet.hairlineWidth,
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + 20,
              paddingBottom: Math.max(insets.bottom, 20) + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <ThemedText style={[styles.brandName, { color: colors.text }]}>UPLIFT</ThemedText>
            <ThemedText style={[styles.logo, { color: colors.text }]}>Sign in</ThemedText>
          </View>

          <View style={styles.form}>
            <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>Email</ThemedText>
            <TextInput
              style={[styles.input, inputSurface, { color: colors.text }]}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              editable={!loading}
            />
            <ThemedText style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 14 }]}>Password</ThemedText>
            <TextInput
              style={[styles.input, inputSurface, { color: colors.text }]}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              editable={!loading}
            />
            <Pressable
              onPress={handleForgotPassword}
              disabled={loading}
              style={styles.forgotWrap}
              hitSlop={8}
            >
              <ThemedText style={[styles.forgotText, { color: colors.tint }]}>Forgot password?</ThemedText>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: BrandViolet.primary, opacity: pressed ? 0.88 : loading ? 0.7 : 1 },
            ]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>Sign in</ThemedText>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
            <ThemedText style={[styles.dividerText, { color: colors.textMuted }]}>or</ThemedText>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
          </View>

          <View style={styles.socialBtns}>
            <AppleSignInButton />
            <GoogleSignInButton />
          </View>

          <View style={styles.footer}>
            <ThemedText style={[styles.footerText, { color: colors.textMuted }]}>
              New here?{' '}
            </ThemedText>
            <Pressable onPress={() => router.push('/sign-up')}>
              <ThemedText style={[styles.footerLink, { color: colors.tint }]}>Sign up</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
  brand: {
    marginBottom: 28,
    paddingTop: 4,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 8,
  },
  logo: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  socialBtns: { gap: 10, marginBottom: 8 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 24,
    marginBottom: 20,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13, fontWeight: '400' },
  form: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '400',
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: 10,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 40,
  },
  footerText: { fontSize: 14 },
  footerLink: { fontSize: 14, fontWeight: '600' },
})
