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
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { createGroup } from '@/lib/groups'

export default function CreateGroupScreen() {
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      Alert.alert('Name required', 'Enter a group name.')
      return
    }
    if (!session) return
    setSaving(true)
    const { group, error } = await createGroup(session.user.id, trimmed, description.trim() || null)
    setSaving(false)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    router.back()
  }

  if (!session) return null

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ThemedText style={[styles.label, { color: colors.textMuted }]}>Group name</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
            ]}
            placeholder="e.g. Morning Crew"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            editable={!saving}
          />
          <ThemedText style={[styles.label, { color: colors.textMuted }]}>Description (optional)</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.inputMultiline,
              { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
            ]}
            placeholder="What's this group about?"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            editable={!saving}
          />
          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>Create group</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  label: { fontSize: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
})
