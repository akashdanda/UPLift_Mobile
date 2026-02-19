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

import GoogleSignInButton from '@/components/social-auth-buttons/google-sign-in-button'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useAuthContext } from '@/hooks/use-auth-context'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

const MIN_PASSWORD_LENGTH = 6

export default function SignUpScreen() {
  const { signUp } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const insets = useSafeAreaInsets()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignUp = async () => {
    const trimmed = email.trim()
    if (!trimmed || !password) {
      Alert.alert('Error', 'Please enter email and password.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Error', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setLoading(true)
    const { error } = await signUp(trimmed, password)
    setLoading(false)
    if (error) {
      Alert.alert('Sign up failed', error.message)
      return
    }
    // Supabase may require email confirmation; if so, no session yet
    Alert.alert(
      'Check your email',
      'We sent you a confirmation link. Sign in after confirming your email.',
      [{ text: 'OK', onPress: () => router.replace('/login') }]
    )
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
          Create account
        </ThemedText>
        <View style={[styles.formCard, { backgroundColor: colors.card }]}>
          <TextInput
            style={[
              styles.input,
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
            placeholder={`Password (min ${MIN_PASSWORD_LENGTH} characters)`}
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint },
            pressed && styles.buttonPressed,
          ]}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.primaryButtonText}>Sign up</ThemedText>
          )}
        </Pressable>

        <View style={styles.orRow}>
          <View style={[styles.orLine, { backgroundColor: colors.tabBarBorder }]} />
          <ThemedText style={[styles.orText, { color: colors.textMuted }]}>or</ThemedText>
          <View style={[styles.orLine, { backgroundColor: colors.tabBarBorder }]} />
        </View>

        <GoogleSignInButton />

        <View style={styles.footer}>
          <ThemedText style={{ color: colors.textMuted }}>Already have an account? </ThemedText>
          <Pressable onPress={() => router.back()} disabled={loading}>
            <ThemedText type="link" style={styles.link}>
              Sign in
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
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
  },
  orText: {
    fontSize: 13,
    textTransform: 'lowercase',
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
