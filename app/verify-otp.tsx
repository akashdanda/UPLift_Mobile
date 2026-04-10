import { router, useLocalSearchParams } from 'expo-router'
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

import { ThemedText } from '@/components/themed-text'
import { BrandViolet, Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { supabase } from '@/lib/supabase'

export default function VerifyOtpScreen() {
  const { verifyPhoneOtp } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ phone?: string; displayName?: string }>()

  const phone = typeof params.phone === 'string' ? params.phone : ''
  const displayName = typeof params.displayName === 'string' ? params.displayName.trim() : ''

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const inputSurface = {
    backgroundColor: colors.card,
    borderColor: colors.tabBarBorder,
    borderWidth: StyleSheet.hairlineWidth,
  }

  const syncProfileAfterVerify = async (userId: string) => {
    if (displayName) {
      await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          full_name: displayName,
          phone_e164: phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
    } else if (phone) {
      await supabase
        .from('profiles')
        .update({ phone_e164: phone, updated_at: new Date().toISOString() })
        .eq('id', userId)
    }
  }

  const handleVerify = async () => {
    const digits = code.replace(/\D/g, '')
    if (!phone) {
      Alert.alert('Error', 'Missing phone number. Go back and try again.')
      return
    }
    if (digits.length < 6) {
      Alert.alert('Error', 'Enter the 6-digit code from your text message.')
      return
    }
    setLoading(true)
    const { error } = await verifyPhoneOtp(phone, digits)
    setLoading(false)
    if (error) {
      Alert.alert('Verification failed', error.message)
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.user?.id) {
      await syncProfileAfterVerify(session.user.id)
    }
    router.replace('/(tabs)')
  }

  if (!phone) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
        <ThemedText style={{ color: colors.text, textAlign: 'center', paddingHorizontal: 24 }}>
          Invalid link. Go back and enter your phone number again.
        </ThemedText>
        <Pressable style={[styles.primaryBtn, { backgroundColor: BrandViolet.primary, marginTop: 20, marginHorizontal: 24 }]} onPress={() => router.back()}>
          <ThemedText style={styles.primaryBtnText}>Go back</ThemedText>
        </Pressable>
      </View>
    )
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
            <ThemedText style={[styles.title, { color: colors.text }]}>Enter code</ThemedText>
            <ThemedText style={[styles.subtitle, { color: colors.textMuted }]}>
              We texted a 6-digit code to{'\n'}
              <ThemedText style={{ fontWeight: '700', color: colors.text }}>{phone}</ThemedText>
            </ThemedText>
          </View>

          <TextInput
            style={[styles.codeInput, inputSurface, { color: colors.text }]}
            placeholder="000000"
            placeholderTextColor={colors.textMuted}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
            autoFocus
          />

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: BrandViolet.primary, opacity: pressed ? 0.88 : loading ? 0.7 : 1 },
            ]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>Continue</ThemedText>
            )}
          </Pressable>

          <Pressable style={styles.resendWrap} onPress={() => router.back()} disabled={loading}>
            <ThemedText style={[styles.resendText, { color: colors.tint }]}>Wrong number? Go back</ThemedText>
          </Pressable>
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
  brand: { marginBottom: 32, paddingTop: 4 },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtitle: { fontSize: 15, lineHeight: 22 },
  codeInput: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 24,
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
  resendWrap: { alignItems: 'center', marginTop: 24 },
  resendText: { fontSize: 14, fontWeight: '600' },
})
