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
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ThemedView style={styles.inner}>
            <View style={styles.header}>
              <ThemedText type="title" style={[styles.logo, { color: colors.text }]}>
                Uplift
              </ThemedText>
              <ThemedText style={[styles.tagline, { color: colors.textMuted }]}>
                Your fitness community
              </ThemedText>
            </View>

            <ThemedText type="subtitle" style={[styles.sectionLabel, { color: colors.text }]}>
              Reset password
            </ThemedText>

            {sent ? (
              <View style={[styles.formCard, { backgroundColor: colors.card }]}>
                <ThemedText style={[styles.successText, { color: colors.text }]}>
                  Check your email for a password reset link. If you don&apos;t see it, check your spam folder.
                </ThemedText>
              </View>
            ) : (
              <>
                <ThemedText style={[styles.description, { color: colors.textMuted }]}>
                  Enter the email associated with your account and we&apos;ll send you a link to reset your password.
                </ThemedText>
                <View style={[styles.formCard, { backgroundColor: colors.card }]}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputLast,
                      {
                        backgroundColor: colors.background,
                        color: colors.text,
                        borderColor: colors.tabBarBorder,
                      },
                    ]}
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
                    styles.primaryButton,
                    { backgroundColor: colors.tint },
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleReset}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>Send reset link</ThemedText>
                  )}
                </Pressable>
              </>
            )}

            <View style={styles.footer}>
              <Pressable onPress={() => router.back()} disabled={loading}>
                <ThemedText type="link" style={styles.link}>
                  Back to sign in
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  inner: {
    paddingHorizontal: 0,
  },
  header: {
    marginBottom: 32,
  },
  logo: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionLabel: {
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  formCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  inputLast: {
    marginBottom: 0,
  },
  successText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    flexWrap: 'wrap',
  },
  link: {
    fontWeight: '600',
  },
})
