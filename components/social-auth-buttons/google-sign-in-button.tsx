import { Image } from 'expo-image'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'

import { useAuthContext } from '@/hooks/use-auth-context'

/** Official multicolor “G” (Google brand assets). */
const googleGMark = require('../../assets/images/googleg_standard_color_128dp.png')

/** Google Identity branding — neutral outline button + full-color G. */
const GOOGLE = {
  surface: '#FFFFFF',
  border: '#747775',
  label: '#1F1F1F',
  blue: '#4285F4',
} as const

export default function GoogleSignInButton() {
  const { signInWithGoogle } = useAuthContext()
  const [loading, setLoading] = useState(false)

  const handlePress = async () => {
    setLoading(true)
    const { error } = await signInWithGoogle()
    setLoading(false)
    if (error) Alert.alert('Sign in with Google failed', error.message)
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: GOOGLE.surface,
          borderColor: GOOGLE.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      onPress={handlePress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={GOOGLE.blue} />
      ) : (
        <View style={styles.inner}>
          <Image source={googleGMark} style={styles.gMark} contentFit="contain" accessibilityIgnoresInvertColors />
          <Text style={styles.label}>Continue with Google</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gMark: { width: 18, height: 18 },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: GOOGLE.label,
    letterSpacing: 0.1,
  },
})
