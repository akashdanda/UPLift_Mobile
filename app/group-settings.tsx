import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
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
import { uploadGroupImage } from '@/lib/group-upload'
import { getGroupDetails, getMemberRole, updateGroup, type GroupWithMeta } from '@/lib/groups'

function getGroupInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [group, setGroup] = useState<GroupWithMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [location, setLocation] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  const [avatarLoadError, setAvatarLoadError] = useState(false)

  const userId = session?.user?.id ?? ''

  const loadGroup = useCallback(async () => {
    if (!id || !userId) return
    setLoading(true)
    try {
      const groupData = await getGroupDetails(id)
      if (!groupData) {
        Alert.alert('Error', 'Group not found')
        router.back()
        return
      }

      // Verify user is owner or admin
      const role = await getMemberRole(id, userId)
      if (!role || role === 'member') {
        Alert.alert('Error', 'Only group owner or admin can edit settings')
        router.back()
        return
      }

      setGroup(groupData)
      setName(groupData.name)
      setDescription(groupData.description || '')
      setTags(groupData.tags?.join(', ') || '')
      setLocation(groupData.location || '')
      setIsPublic(groupData.is_public)
    } catch {
      Alert.alert('Error', 'Failed to load group')
      router.back()
    } finally {
      setLoading(false)
    }
  }, [id, userId])

  useEffect(() => {
    void loadGroup()
  }, [loadGroup])

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to change the group picture.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setPendingPhotoUri(result.assets[0].uri)
      setAvatarLoadError(false)
    }
  }

  const handleSave = async () => {
    if (!id || !userId || !group) return

    if (!name.trim()) {
      Alert.alert('Error', 'Group name is required')
      return
    }

    setSaving(true)

    try {
      let avatarUrl = group.avatar_url

      // Upload new photo if selected
      if (pendingPhotoUri) {
        setUploadingPhoto(true)
        const uploadResult = await uploadGroupImage(id, pendingPhotoUri)
        setUploadingPhoto(false)

        if ('error' in uploadResult) {
          Alert.alert('Error', uploadResult.error.message)
          setSaving(false)
          return
        }
        avatarUrl = uploadResult.url
      }

      // Parse tags
      const tagsArray = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const { error } = await updateGroup(id, userId, {
        name: name.trim(),
        description: description.trim() || null,
        tags: tagsArray,
        avatar_url: avatarUrl,
        location: location.trim() || null,
        is_public: isPublic,
      })

      if (error) {
        Alert.alert('Error', error.message)
      } else {
        Alert.alert('Success', 'Group settings updated', [
          { text: 'OK', onPress: () => router.back() },
        ])
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    )
  }

  if (!group) return null

  const currentAvatarUri = pendingPhotoUri || group.avatar_url
  const showAvatarImage = currentAvatarUri && !avatarLoadError

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText type="title" style={[styles.title, { color: colors.text }]}>
            Group Settings
          </ThemedText>

          {/* Profile Picture */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Profile Picture
            </ThemedText>
            <View style={styles.avatarSection}>
              <Pressable onPress={handlePickImage} disabled={uploadingPhoto}>
                <View style={[styles.avatarContainer, { backgroundColor: colors.tint + '25' }]}>
                  {showAvatarImage ? (
                    <Image
                      source={{ uri: currentAvatarUri! }}
                      style={styles.avatarImage}
                      onError={() => setAvatarLoadError(true)}
                    />
                  ) : (
                    <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>
                      {getGroupInitials(name || 'Group')}
                    </ThemedText>
                  )}
                </View>
              </Pressable>
              <Pressable
                style={[styles.changePhotoButton, { borderColor: colors.tabBarBorder }]}
                onPress={handlePickImage}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator color={colors.tint} size="small" />
                ) : (
                  <ThemedText style={[styles.changePhotoText, { color: colors.tint }]}>Change Photo</ThemedText>
                )}
              </Pressable>
            </View>
          </View>

          {/* Group Name */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Group Name *
            </ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder }]}
              placeholder="Enter group name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Description */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Description
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
              ]}
              placeholder="Brief description of your group"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Location */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Location
            </ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder }]}
              placeholder="e.g., New York, NY or Champaign, Illinois"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
            />
          </View>

          {/* Tags */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
              Tags
            </ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder }]}
              placeholder="Running, Cycling, etc. (comma separated)"
              placeholderTextColor={colors.textMuted}
              value={tags}
              onChangeText={setTags}
            />
            <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
              Separate tags with commas
            </ThemedText>
          </View>

          {/* Privacy */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <ThemedText type="defaultSemiBold" style={[styles.switchTitle, { color: colors.text }]}>
                  Public Group
                </ThemedText>
                <ThemedText style={[styles.switchDescription, { color: colors.textMuted }]}>
                  Anyone can find and join this group
                </ThemedText>
              </View>
              <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ false: colors.tabBarBorder, true: colors.tint }} />
            </View>
          </View>

          {/* Save Button */}
          <Pressable
            style={[styles.saveButton, { backgroundColor: colors.tint }]}
            onPress={handleSave}
            disabled={saving || uploadingPhoto}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 24 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },

  avatarSection: { alignItems: 'center', gap: 12 },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 100, height: 100 },
  avatarInitials: { fontSize: 36, fontWeight: '600' },
  changePhotoButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  changePhotoText: { fontSize: 14, fontWeight: '600' },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: { fontSize: 12, marginTop: 6 },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { flex: 1, marginRight: 12 },
  switchTitle: { fontSize: 16, marginBottom: 4 },
  switchDescription: { fontSize: 13 },

  saveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
