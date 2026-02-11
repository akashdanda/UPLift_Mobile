import { Pressable, StyleSheet } from 'react-native'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'

export default function SignOutButton() {
  const { signOut } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.tabBarBorder },
        pressed && styles.buttonPressed,
      ]}
      onPress={() => signOut()}
    >
      <ThemedText style={[styles.label, { color: colors.text }]}>Sign out</ThemedText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
})
