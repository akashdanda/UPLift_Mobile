import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function AppleSignInButton() {
  const { signInWithApple } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [loading, setLoading] = useState(false)

  const handlePress = async () => {
    setLoading(true)
    const { error } = await signInWithApple()
    setLoading(false)
    if (error) {
      Alert.alert('Sign in with Apple failed', error.message)
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: '#000',
          borderColor: '#000',
        },
        pressed && styles.buttonPressed,
      ]}
      onPress={handlePress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <ThemedText style={styles.label}>Sign in with Apple</ThemedText>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: 12,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
})

