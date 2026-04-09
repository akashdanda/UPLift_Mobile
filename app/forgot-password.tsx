import { Ionicons } from '@expo/vector-icons'
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { BrandViolet, Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const insets = useSafeAreaInsets()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleReset = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      Alert.alert('Error', 'Please enter your email address.')
      return
    }
    setLoading(true)
    const { error } = await resetPassword(trimmed)
    setLoading(false)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setSent(true)
  }

  const inputSurface = {
    backgroundColor: colors.card,
    borderColor: colors.tabBarBorder,
    borderWidth: StyleSheet.hairlineWidth,
  }

  const cardSurface = {
    backgroundColor: colors.card,
    borderColor: colors.tabBarBorder,
    borderWidth: StyleSheet.hairlineWidth,
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <ThemedText style={[styles.logo, { color: colors.text }]}>Reset password</ThemedText>
            <ThemedText style={[styles.tagline, { color: colors.textMuted }]}>
              {sent ? 'Check your inbox for a reset link' : "We'll send you a link to reset it"}
            </ThemedText>
          </View>

          {sent ? (
            <View style={[styles.successCard, cardSurface]}>
              <Ionicons name="checkmark-circle" size={28} color="#22C55E" />
              <ThemedText style={[styles.successText, { color: colors.textMuted }]}>
                If an account exists with that email, you'll receive a password reset link. Check spam if you don't see it.
              </ThemedText>
            </View>
          ) : (
            <>
              <View style={styles.form}>
                <TextInput
                  style={[styles.input, inputSurface, { color: colors.text }]}
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: BrandViolet.primary, opacity: pressed ? 0.88 : loading ? 0.7 : 1 },
                ]}
                onPress={handleReset}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.primaryBtnText}>Send reset link</ThemedText>
                )}
              </Pressable>
            </>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="arrow-back" size={15} color={colors.tint} />
              <ThemedText style={[styles.backText, { color: colors.tint }]}>Back to sign in</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
  brand: { marginBottom: 40 },
  logo: { fontSize: 38, fontWeight: '700', letterSpacing: -1 },
  tagline: { fontSize: 15, fontWeight: '400', marginTop: 4, lineHeight: 22 },
  form: { gap: 12, marginBottom: 24 },
  input: { borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, fontWeight: '400' },
  primaryBtn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  successCard: { borderRadius: 16, padding: 24, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  successText: { flex: 1, fontSize: 14, lineHeight: 21 },
  footer: { alignItems: 'center', marginTop: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14, fontWeight: '500' },
})
