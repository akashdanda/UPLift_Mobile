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
import { normalizeToE164 } from '@/lib/phone-auth'

export default function LoginScreen() {
  const { sendPhoneOtp } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const insets = useSafeAreaInsets()
  const isDark = colorScheme === 'dark'

  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendCode = async () => {
    const e164 = normalizeToE164(phone)
    if (!e164) {
      Alert.alert('Invalid number', 'Enter a valid US phone number (10 digits) or include country code with +.')
      return
    }
    setLoading(true)
    const { error } = await sendPhoneOtp(e164, { isSignUp: false })
    setLoading(false)
    if (error) {
      Alert.alert('Could not send code', error.message)
      return
    }
    router.push({ pathname: '/verify-otp', params: { phone: e164 } })
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
            <ThemedText style={[styles.tagline, { color: colors.textMuted }]}>
              Use Google, Apple, or your phone number
            </ThemedText>
          </View>

          <View style={styles.socialBtns}>
            <AppleSignInButton />
            <GoogleSignInButton />
          </View>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
            <ThemedText style={[styles.dividerText, { color: colors.textMuted }]}>or</ThemedText>
            <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
          </View>

          <View style={styles.form}>
            <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>Phone number</ThemedText>
            <TextInput
              style={[styles.input, inputSurface, { color: colors.text }]}
              placeholder="(555) 123-4567"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              editable={!loading}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: BrandViolet.primary, opacity: pressed ? 0.88 : loading ? 0.7 : 1 },
            ]}
            onPress={handleSendCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>Send code</ThemedText>
            )}
          </Pressable>

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
    marginBottom: 8,
  },
  tagline: { fontSize: 14, lineHeight: 20 },
  socialBtns: { gap: 10, marginBottom: 8 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 13, fontWeight: '400' },
  form: {
    gap: 8,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '400',
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
