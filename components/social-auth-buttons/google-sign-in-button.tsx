import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { useAuthContext } from '@/hooks/use-auth-context'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function GoogleSignInButton() {
  const { signInWithGoogle } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [loading, setLoading] = useState(false)

  const handlePress = async () => {
    setLoading(true)
    const { error } = await signInWithGoogle()
    setLoading(false)
    if (error) {
      Alert.alert('Sign in with Google failed', error.message)
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: colors.tabBarBorder,
        },
        pressed && styles.buttonPressed,
      ]}
      onPress={handlePress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <ThemedText style={[styles.label, { color: colors.text }]}>
          Continue with Google
        </ThemedText>
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
  },
  buttonPressed: {
    opacity: 0.9,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
})
