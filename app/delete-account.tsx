import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { supabase } from '@/lib/supabase'

export default function DeleteAccountScreen() {
  const { session, signOut } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!session || deleting) return
    setDeleting(true)
    try {
      // Call a Supabase function that deletes the user and related data.
      // You need to create this function in Supabase (see supabase/run-account-deletion-in-dashboard.sql).
      const { error } = await supabase.rpc('delete_user_and_data')
      if (error) {
        Alert.alert('Delete failed', error.message)
        setDeleting(false)
        return
      }
      await signOut()
      Alert.alert('Account deleted', 'Your account and data have been deleted.', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ])
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.'
      Alert.alert('Delete failed', message)
      setDeleting(false)
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
          Delete account
        </ThemedText>
        <ThemedText style={[styles.body, { color: colors.textMuted }]}>
          Deleting your account will permanently remove your profile, workouts, groups, messages, and all other data
          associated with your account. This action cannot be undone.
        </ThemedText>
        <ThemedText style={[styles.body, { color: colors.textMuted, marginTop: 8 }]}>
          If you just want to stop receiving notifications, you can turn them off in Settings instead.
        </ThemedText>

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.secondaryButton, { borderColor: colors.tabBarBorder }]}
            onPress={() => router.back()}
            disabled={deleting}
          >
            <ThemedText style={[styles.secondaryLabel, { color: colors.text }]}>Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.deleteButton, { backgroundColor: '#EF4444' }]}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.deleteLabel}>Delete my account</ThemedText>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    gap: 12,
  },
  title: {
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
})

