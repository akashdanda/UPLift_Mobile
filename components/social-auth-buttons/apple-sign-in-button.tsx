import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function AppleSignInButton() {
  const { signInWithApple } = useAuthContext()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [loading, setLoading] = useState(false)

  const handlePress = async () => {
    setLoading(true)
    const { error } = await signInWithApple()
    setLoading(false)
    if (error) Alert.alert('Sign in with Apple failed', error.message)
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: isDark ? '#fff' : '#000' },
        pressed && { opacity: 0.8 },
      ]}
      onPress={handlePress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={isDark ? '#000' : '#fff'} />
      ) : (
        <View style={styles.inner}>
          <Ionicons name="logo-apple" size={18} color={isDark ? '#000' : '#fff'} />
          <ThemedText style={[styles.label, { color: isDark ? '#000' : '#fff' }]}>
            Continue with Apple
          </ThemedText>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '500' },
})
