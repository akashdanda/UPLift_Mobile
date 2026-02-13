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
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { useAuthContext } from '@/hooks/use-auth-context'
import { uploadAvatar } from '@/lib/avatar-upload'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'

function getInitialDisplayName(
  session: { user: { user_metadata?: { full_name?: string }; email?: string } } | null,
  profile: { display_name?: string | null } | null
): string {
  if (profile?.display_name) return profile.display_name
  if (session?.user?.user_metadata?.full_name) return session.user.user_metadata.full_name
  if (session?.user?.email) return session.user.email.split('@')[0] ?? ''
  return ''
}

function getInitialFullName(
  session: { user: { user_metadata?: { full_name?: string } } } | null,
  profile: { full_name?: string | null } | null
): string {
  if (profile?.full_name) return profile.full_name
  if (session?.user?.user_metadata?.full_name) return session.user.user_metadata.full_name
  return ''
}

function getAvatarUrl(
  profile: { avatar_url?: string | null } | null,
  session: { user: { user_metadata?: { avatar_url?: string } } } | null
): string | null {
  if (profile?.avatar_url) return profile.avatar_url
  if (session?.user?.user_metadata?.avatar_url) return session.user.user_metadata.avatar_url
  return null
}

function getInitials(displayName: string, email: string | undefined): string {
  if (displayName && displayName.trim()) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
}

export default function EditProfileScreen() {
  const { session, profile, updateProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [displayName, setDisplayName] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [canChangeDisplayName, setCanChangeDisplayName] = useState(true)
  const [nextChangeDate, setNextChangeDate] = useState<string | null>(null)
  // Show new photo immediately after upload (before profile refetch)
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null)
  // When remote image fails to load, show initials instead of blank
  const [avatarLoadError, setAvatarLoadError] = useState(false)

  const avatarUrl = localAvatarUrl ?? getAvatarUrl(profile, session)
  const showAvatarImage = avatarUrl && !avatarLoadError
  const initials = getInitials(displayName || getInitialDisplayName(session, profile), session?.user?.email)

  useEffect(() => {
    setDisplayName(getInitialDisplayName(session, profile))
    setFullName(getInitialFullName(session, profile))
    setBio(profile?.bio || '')
    setLocalAvatarUrl(null)
    setAvatarLoadError(false)
    
    // Check if display_name can be changed
    const checkDisplayNameLimit = async () => {
      if (!session) return
      try {
        const { data: canChange } = await supabase.rpc('can_change_display_name', {
          user_id_param: session.user.id,
        })
        setCanChangeDisplayName(canChange ?? true)
        
        if (!canChange && profile?.display_name_changed_at) {
          const lastChanged = new Date(profile.display_name_changed_at)
          const nextChange = new Date(lastChanged)
          nextChange.setDate(nextChange.getDate() + 30)
          setNextChangeDate(nextChange.toLocaleDateString())
        } else {
          setNextChangeDate(null)
        }
      } catch {
        setCanChangeDisplayName(true)
        setNextChangeDate(null)
      }
    }
    
    void checkDisplayNameLimit()
  }, [session, profile])

  // Reset load error when URL changes so we try again
  useEffect(() => {
    setAvatarLoadError(false)
  }, [avatarUrl])

  const handleChangePhoto = async () => {
    if (!session) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photos to change your profile picture.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]?.uri) return
    setUploadingPhoto(true)
    const uploadResult = await uploadAvatar(session.user.id, result.assets[0].uri)
    setUploadingPhoto(false)
    if ('error' in uploadResult) {
      Alert.alert('Upload failed', uploadResult.error.message)
      return
    }
    const { error } = await updateProfile({ avatar_url: uploadResult.url })
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    setLocalAvatarUrl(uploadResult.url)
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await updateProfile({
      display_name: displayName.trim() || null,
      full_name: fullName.trim() || null,
      bio: bio.trim() || null,
    })
    setSaving(false)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    router.back()
  }

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
              onPress={handleChangePhoto}
              disabled={uploadingPhoto}
              style={[styles.avatarWrap, { backgroundColor: colors.tint + '25' }]}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color={colors.tint} size="large" />
              ) : showAvatarImage ? (
                <Image
                  source={{ uri: avatarUrl! }}
                  style={styles.avatarImage}
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>{initials}</ThemedText>
              )}
            </Pressable>
            <Pressable onPress={handleChangePhoto} disabled={uploadingPhoto} style={styles.changePhotoButton}>
              <ThemedText style={[styles.changePhotoText, { color: colors.tint }]}>
                {uploadingPhoto ? 'Uploading…' : 'Change photo'}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.labelRow}>
              <ThemedText style={[styles.label, { color: colors.textMuted }]}>Display name</ThemedText>
              {!canChangeDisplayName && nextChangeDate && (
                <ThemedText style={[styles.limitHint, { color: colors.warm }]}>
                  Can change on {nextChangeDate}
                </ThemedText>
              )}
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  color: colors.text,
                  borderColor: colors.tabBarBorder,
                  opacity: canChangeDisplayName ? 1 : 0.6,
                },
              ]}
              placeholder="How you appear in the app"
              placeholderTextColor={colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              editable={!saving && canChangeDisplayName}
            />
            {!canChangeDisplayName && (
              <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
                Display name can only be changed once per month
              </ThemedText>
            )}
          </View>
          <View style={styles.section}>
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Full name</ThemedText>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
              ]}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
              editable={!saving}
            />
          </View>
          <View style={styles.section}>
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Bio</ThemedText>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
              ]}
              placeholder="Tell us about yourself..."
              placeholderTextColor={colors.textMuted}
              value={bio}
              onChangeText={setBio}
              editable={!saving}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.tint },
              pressed && styles.buttonPressed,
            ]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>Save</ThemedText>
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
  avatarSection: { alignItems: 'center', marginBottom: 28 },
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
  avatarInitials: { fontSize: 36, fontWeight: '600' },
  changePhotoButton: { paddingVertical: 8 },
  changePhotoText: { fontSize: 16, fontWeight: '600' },
  section: { marginBottom: 20 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { fontSize: 14 },
  limitHint: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 16,
  },
  buttonPressed: { opacity: 0.9 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
})
