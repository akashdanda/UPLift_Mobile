import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { createGroup } from '@/lib/groups'
import { uploadGroupImage } from '@/lib/group-upload'
import { supabase } from '@/lib/supabase'

export default function CreateGroupScreen() {
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [location, setLocation] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  const [avatarLoadError, setAvatarLoadError] = useState(false)

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to add a group picture.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]?.uri) return
    setPendingPhotoUri(result.assets[0].uri)
    setAvatarLoadError(false)
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      Alert.alert('Name required', 'Enter a group name.')
      return
    }
    if (!session) return
    setSaving(true)

    // Parse tags (comma-separated)
    const tagsArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    // Upload image if provided
    let avatarUrl: string | null = null
    if (pendingPhotoUri) {
      setUploadingPhoto(true)
      // We'll need to create the group first to get the ID, then update it with the image
      // For now, let's create without image and update after
    }

    const { error, group } = await createGroup(
      session.user.id,
      trimmed,
      description.trim() || null,
      tagsArray,
      avatarUrl,
      location.trim() || null,
      isPublic
    )

    if (error) {
      setSaving(false)
      setUploadingPhoto(false)
      Alert.alert('Error', error.message)
      return
    }

    // Upload image after group is created
    if (pendingPhotoUri && group) {
      const uploadResult = await uploadGroupImage(group.id, pendingPhotoUri)
      if ('error' in uploadResult) {
        setSaving(false)
        setUploadingPhoto(false)
        Alert.alert('Image upload failed', uploadResult.error.message)
        return
      }
      // Update group with image URL
      const { error: updateError } = await supabase
        .from('groups')
        .update({ avatar_url: uploadResult.url })
        .eq('id', group.id)
      if (updateError) {
        console.error('Failed to update group with image:', updateError)
      }
    }

    setSaving(false)
    setUploadingPhoto(false)
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
          <View style={styles.avatarSection}>
            <Pressable
              onPress={handlePickImage}
              disabled={uploadingPhoto || saving}
              style={[styles.avatarWrap, { backgroundColor: colors.tint + '25' }]}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color={colors.tint} size="large" />
              ) : pendingPhotoUri && !avatarLoadError ? (
                <Image
                  source={{ uri: pendingPhotoUri }}
                  style={styles.avatarImage}
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <ThemedText style={[styles.avatarPlaceholder, { color: colors.tint }]}>+ Photo</ThemedText>
              )}
            </Pressable>
            <Pressable onPress={handlePickImage} disabled={uploadingPhoto || saving} style={styles.changePhotoButton}>
              <ThemedText style={[styles.changePhotoText, { color: colors.tint }]}>
                {pendingPhotoUri ? 'Change photo' : 'Add group photo'}
              </ThemedText>
            </Pressable>
          </View>

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
            placeholder="Short description"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
            editable={!saving}
          />
          <ThemedText style={[styles.label, { color: colors.textMuted }]}>Tags (optional)</ThemedText>
          <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
            Separate tags with commas (e.g., fitness, running, morning)
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
            ]}
            placeholder="fitness, running, morning"
            placeholderTextColor={colors.textMuted}
            value={tags}
            onChangeText={setTags}
            editable={!saving}
          />
          <ThemedText style={[styles.label, { color: colors.textMuted }]}>Location (optional)</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
            ]}
            placeholder="e.g., New York, NY or Champaign, Illinois"
            placeholderTextColor={colors.textMuted}
            value={location}
            onChangeText={setLocation}
            editable={!saving}
          />
          <View style={[styles.toggleRow, { borderColor: colors.tabBarBorder }]}>
            <View style={styles.toggleInfo}>
              <ThemedText style={[styles.toggleLabel, { color: colors.text }]}>Public group</ThemedText>
              <ThemedText style={[styles.toggleHint, { color: colors.textMuted }]}>
                {isPublic ? 'Anyone can discover and join' : 'Only invited people can join'}
              </ThemedText>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ true: colors.tint, false: colors.tabBarBorder }}
            />
          </View>

          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={handleCreate}
            disabled={saving || uploadingPhoto}
          >
            {saving || uploadingPhoto ? (
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
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  avatarImage: { width: 100, height: 100 },
  avatarPlaceholder: { fontSize: 16, fontWeight: '600' },
  changePhotoButton: { paddingVertical: 8 },
  changePhotoText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 8, marginTop: -4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 20,
    borderBottomWidth: 1,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 16, fontWeight: '600' },
  toggleHint: { fontSize: 13, marginTop: 2 },
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
