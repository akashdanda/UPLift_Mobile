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
import { Ionicons } from '@expo/vector-icons'

import { ThemedText } from '@/components/themed-text'
import { useAuthContext } from '@/hooks/use-auth-context'
import { uploadAvatar } from '@/lib/avatar-upload'
import { normalizePhoneE164 } from '@/lib/contact-sync'
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
  const isDark = (colorScheme ?? 'light') === 'dark'

  const [displayName, setDisplayName] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [discoverableByPhone, setDiscoverableByPhone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [canChangeDisplayName, setCanChangeDisplayName] = useState(true)
  const [nextChangeDate, setNextChangeDate] = useState<string | null>(null)
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null)
  const [avatarLoadError, setAvatarLoadError] = useState(false)

  const avatarUrl = localAvatarUrl ?? getAvatarUrl(profile, session)
  const showAvatarImage = avatarUrl && !avatarLoadError
  const initials = getInitials(displayName || getInitialDisplayName(session, profile), session?.user?.email)

  const inputBorderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'

  useEffect(() => {
    setDisplayName(getInitialDisplayName(session, profile))
    setFullName(getInitialFullName(session, profile))
    setBio(profile?.bio || '')
    setPhoneInput(profile?.phone_e164 ?? '')
    setDiscoverableByPhone(profile?.discoverable_by_phone ?? false)
    setLocalAvatarUrl(null)
    setAvatarLoadError(false)
    
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
    const rawPhone = phoneInput.trim()
    const normalized = rawPhone ? normalizePhoneE164(rawPhone) : null
    if (discoverableByPhone && !normalized) {
      Alert.alert('Phone number', 'Add a valid phone number or turn off "Findable by phone".')
      return
    }
    setSaving(true)
    const { error } = await updateProfile({
      display_name: displayName.trim() || null,
      full_name: fullName.trim() || null,
      bio: bio.trim() || null,
      phone_e164: normalized,
      discoverable_by_phone: discoverableByPhone && !!normalized,
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
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <Pressable
              onPress={handleChangePhoto}
              disabled={uploadingPhoto}
              style={[
                styles.avatarWrap,
                {
                  backgroundColor: colors.tint + '25',
                  borderWidth: 3,
                  borderColor: colors.tint + '40',
                },
              ]}
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

          {/* Display Name */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <ThemedText style={[styles.label, { color: colors.textMuted }]}>DISPLAY NAME</ThemedText>
              {!canChangeDisplayName && nextChangeDate && (
                <ThemedText style={[styles.limitHint, { color: colors.warm }]}>
                  Can change on {nextChangeDate}
                </ThemedText>
              )}
            </View>
            <View
              style={[
                styles.inputRow,
                {
                  backgroundColor: colors.card,
                  borderColor: inputBorderColor,
                  opacity: canChangeDisplayName ? 1 : 0.6,
                },
              ]}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.inputInner, { color: colors.text }]}
                placeholder="How you appear in the app"
                placeholderTextColor={colors.textMuted}
                value={displayName}
                onChangeText={setDisplayName}
                editable={!saving && canChangeDisplayName}
              />
            </View>
            {!canChangeDisplayName && (
              <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
                Display name can only be changed once per month
              </ThemedText>
            )}
          </View>

          {/* Full Name */}
          <View style={styles.section}>
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>FULL NAME</ThemedText>
            <View
              style={[
                styles.inputRow,
                { backgroundColor: colors.card, borderColor: inputBorderColor },
              ]}
            >
              <Ionicons
                name="text-outline"
                size={18}
                color={colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.inputInner, { color: colors.text }]}
                placeholder="Optional"
                placeholderTextColor={colors.textMuted}
                value={fullName}
                onChangeText={setFullName}
                editable={!saving}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.section}>
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>PHONE (OPTIONAL)</ThemedText>
            <ThemedText style={[styles.hint, { color: colors.textMuted, marginBottom: 8 }]}>
              Used only to let friends find you when they sync contacts. Save as digits; we store E.164 (e.g. +1…).
            </ThemedText>
            <View
              style={[
                styles.inputRow,
                { backgroundColor: colors.card, borderColor: inputBorderColor },
              ]}
            >
              <Ionicons
                name="call-outline"
                size={18}
                color={colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.inputInner, { color: colors.text }]}
                placeholder="+1 or digits only"
                placeholderTextColor={colors.textMuted}
                value={phoneInput}
                onChangeText={setPhoneInput}
                editable={!saving}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <ThemedText style={[styles.label, { color: colors.textMuted, marginBottom: 4 }]}>
                  Findable by phone
                </ThemedText>
                <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
                  Others can match you when they sync contacts
                </ThemedText>
              </View>
              <Switch
                value={discoverableByPhone}
                onValueChange={setDiscoverableByPhone}
                disabled={saving}
                trackColor={{ false: colors.tabBarBorder, true: colors.tint + '88' }}
                thumbColor={discoverableByPhone ? colors.tint : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Bio */}
          <View style={styles.section}>
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>BIO</ThemedText>
            <View
              style={[
                styles.inputRow,
                styles.textAreaRow,
                { backgroundColor: colors.card, borderColor: inputBorderColor },
              ]}
            >
              <Ionicons
                name="create-outline"
                size={18}
                color={colors.textMuted}
                style={[styles.inputIcon, { marginTop: 2 }]}
              />
              <TextInput
                style={[styles.inputInner, styles.textArea, { color: colors.text }]}
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
          </View>

          {/* Save Button */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.tint },
              pressed && styles.buttonPressed,
            ]}
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
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  limitHint: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 6 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputInner: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 14,
  },
  textAreaRow: {
    alignItems: 'flex-start',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 16,
    },
  buttonPressed: { opacity: 0.9 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
})
