import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { CameraCapture } from '@/components/camera-capture'
import { CelebrationModal } from '@/components/celebration-modal'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getFriends, type FriendWithProfile } from '@/lib/friends'
import { computeXP, getLevelFromXP } from '@/lib/levels'
import { pushFirstFriendWorkout } from '@/lib/push-notifications'
import { isCheckedInAtGym } from '@/lib/presence-service'
import { supabase } from '@/lib/supabase'
import { addWorkoutTags } from '@/lib/tags'
import { uploadWorkoutImage } from '@/lib/workout-upload'
import type { UserLevel } from '@/types/level'
import type { Workout, WorkoutVisibility } from '@/types/workout'

/** Stored for analytics / feed; no longer user-selectable in this screen. */
const DEFAULT_WORKOUT_TYPE = 'strength' as const

function BeRealPreview({ primaryUri, secondaryUri }: { primaryUri: string; secondaryUri: string }) {
  const [frontImage, setFrontImage] = useState<'primary' | 'secondary'>('primary')

  const mainUri = frontImage === 'primary' ? primaryUri : secondaryUri
  const overlayUri = frontImage === 'primary' ? secondaryUri : primaryUri

  const toggle = () => {
    setFrontImage((f) => (f === 'primary' ? 'secondary' : 'primary'))
  }

  return (
    <View style={styles.dualPreview}>
      <Pressable style={{ width: '100%', height: '100%' }} onPressIn={toggle}>
        <Image source={{ uri: mainUri }} style={styles.dualPreviewMain} />
      </Pressable>
      <Pressable style={styles.dualPreviewSecondaryWrap} onPressIn={toggle}>
        <Image source={{ uri: overlayUri }} style={styles.dualPreviewSecondary} />
      </Pressable>
    </View>
  )
}

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return '?'
}

function getTodayLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function paramString(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (Array.isArray(v) && v[0]) return v[0]
  return undefined
}

export default function LogWorkoutScreen() {
  const { session, profile, refreshProfile } = useAuthContext()
  const params = useLocalSearchParams<{ gymId?: string; gymName?: string }>()
  const gymId = paramString(params.gymId)
  const gymName = paramString(params.gymName)
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'
  const insets = useSafeAreaInsets()

  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkInAllowed, setCheckInAllowed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  // Photo(s) taken but not yet posted (caption step). BeReal-style: primary + optional secondary.
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  const [pendingSecondaryUri, setPendingSecondaryUri] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState<'primary' | 'secondary'>('primary')
  // Level-up celebration
  const [levelUpCelebration, setLevelUpCelebration] = useState<UserLevel | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)

  // Post visibility
  const [visibility, setVisibility] = useState<WorkoutVisibility>('friends')

  // Friend tagging
  const [friends, setFriends] = useState<FriendWithProfile[]>([])
  const [taggedFriends, setTaggedFriends] = useState<Set<string>>(new Set())
  const [showTagPicker, setShowTagPicker] = useState(false)

  const today = getTodayLocalDate()

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('workout_date', today)
        .maybeSingle()
      if (cancelled) return
      if (data) {
        setTodayWorkout(data as Workout)
        setCheckInAllowed(true)
        setLoading(false)
        return
      }
      if (!gymId) {
        setCheckInAllowed(false)
        setLoading(false)
        return
      }
      const ok = await isCheckedInAtGym(session.user.id, gymId)
      if (!cancelled) {
        setCheckInAllowed(ok)
        setLoading(false)
      }
    })()
    getFriends(session.user.id).then(setFriends).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, today, gymId])

  const handleTakePhoto = () => {
    if (!session) return
    // Always start with back camera for the workout shot
    setCameraMode('primary')
    setCameraOpen(true)
  }

  const handleCapture = (uri: string) => {
    if (cameraMode === 'primary') {
      // First capture: workout (back camera). Immediately switch to selfie (front) without confirmation.
      setPendingPhotoUri(uri)
      setCameraMode('secondary')
      // Keep camera open; CameraCapture will re-render with facing='front'.
    } else {
      // Second capture: selfie (front camera). Now close camera and move to caption step.
      setPendingSecondaryUri(uri)
      setCameraOpen(false)
    }
  }

  const handlePost = async () => {
    if (!session || !pendingPhotoUri || !gymId) return
    const stillCheckedIn = await isCheckedInAtGym(session.user.id, gymId)
    if (!stillCheckedIn) {
      Alert.alert(
        'Not checked in',
        'You need to be checked in at this gym on the Map to post. Open the Map and step back into the gym.',
      )
      return
    }
    setUploading(true)
    const uploadResult = await uploadWorkoutImage(session.user.id, pendingPhotoUri, 'primary')
    if ('error' in uploadResult) {
      setUploading(false)
      Alert.alert('Upload failed', uploadResult.error.message)
      return
    }
    let secondaryUrl: string | null = null
    if (pendingSecondaryUri) {
      const sec = await uploadWorkoutImage(session.user.id, pendingSecondaryUri, 'secondary')
      if (!('error' in sec)) secondaryUrl = sec.url
    }

    const { data: workoutRow, error } = await supabase
      .from('workouts')
      .insert({
        user_id: session.user.id,
        gym_id: gymId,
        workout_date: today,
        image_url: uploadResult.url,
        secondary_image_url: secondaryUrl,
        workout_type: DEFAULT_WORKOUT_TYPE,
        caption: caption.trim() || null,
        visibility,
      })
      .select()
      .single()

    setUploading(false)
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already logged', "You've already logged a workout for today.")
      } else if (error.code === '42501' || /row-level security|violates row level security/i.test(error.message)) {
        Alert.alert(
          'Check-in required',
          'You must be checked in at this gym to post. Open the Map and check in at your gym, then try again.',
        )
      } else {
        Alert.alert('Error', error.message)
      }
      return
    }

    // Tag friends
    if (taggedFriends.size > 0 && workoutRow) {
      await addWorkoutTags(workoutRow.id, [...taggedFriends]).catch(() => {})
    }

    // Compute level BEFORE refreshing profile (to detect level-up)
    const oldXP = profile
      ? computeXP(profile, 0)
      : 0
    const oldLevel = getLevelFromXP(oldXP)

    setPendingPhotoUri(null)
    setPendingSecondaryUri(null)
    setCaption('')
    await refreshProfile()
    setTodayWorkout({
      id: '',
      user_id: session.user.id,
      gym_id: gymId,
      workout_date: today,
      image_url: uploadResult.url,
      secondary_image_url: secondaryUrl ?? null,
      workout_type: DEFAULT_WORKOUT_TYPE,
      caption: caption.trim() || null,
      visibility,
      created_at: new Date().toISOString(),
    })
    try {
      const newXP = computeXP(
        {
          workouts_count: (profile?.workouts_count ?? 0) + 1,
          streak: (profile?.streak ?? 0) + 1,
          groups_count: profile?.groups_count ?? 0,
          friends_count: profile?.friends_count ?? 0,
        },
        0
      )
      const newLevel = getLevelFromXP(newXP)
      if (newLevel.level.tier !== oldLevel.level.tier) {
        setLevelUpCelebration(newLevel)
        setShowLevelUp(true)
      }
    } catch {
      // Don't block workout posting for level computation errors
    }

    try {
      const displayName = profile?.display_name || 'Your friend'
      const friends = await getFriends(session.user.id)
      for (const f of friends) {
        await pushFirstFriendWorkout(f.id, displayName)
      }
    } catch {
      // best-effort
    }
  }

  if (!session) return null
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
          <ThemedText style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</ThemedText>
        </View>
      </SafeAreaView>
    )
  }

  if (!todayWorkout && !checkInAllowed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right', 'bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.gateScrollContent,
            {
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.gateCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.tabBarBorder,
              },
            ]}
          >
            <View style={[styles.gateIconWrap, { backgroundColor: colors.tint + '18' }]}>
              <Ionicons name="location-outline" size={32} color={colors.tint} />
            </View>
            <ThemedText type="subtitle" style={[styles.gateTitle, { color: colors.text }]}>
              Check in to post
            </ThemedText>
            <ThemedText style={[styles.gateBody, { color: colors.textMuted }]}>
              {!gymId
                ? 'Open the Map, go to a gym, and check in. Then tap Post from the gym sheet to log your workout.'
                : gymName
                  ? `You must be checked in at ${gymName}. Open the Map, step into the gym, then use Post from the bottom sheet.`
                  : 'You must be checked in at this gym on the Map. Step into the gym and open Post from the Map.'}
            </ThemedText>
            <Pressable
              style={[styles.primaryButton, styles.gatePrimaryBtn, { backgroundColor: colors.tint }]}
              onPress={() => router.replace('/(tabs)/map')}
            >
              <ThemedText style={styles.primaryButtonText}>Open Map</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.gateSecondaryBtn, { borderColor: colors.tint }]}
              onPress={() => router.back()}
            >
              <ThemedText style={[styles.backButtonText, { color: colors.tint }]}>Go back</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {todayWorkout ? (
          <View style={styles.doneSection}>
            <ThemedText type="subtitle" style={[styles.doneTitle, { color: colors.text }]}>
              Today&apos;s workout logged
            </ThemedText>
            <ThemedText style={[styles.doneHint, { color: colors.textMuted }]}>
              You can post one workout per day. Come back tomorrow for the next one.
            </ThemedText>
            <View style={[styles.imageWrap, { backgroundColor: colors.card, shadowOpacity: isDark ? 0.2 : 0.1, }]}>
              {todayWorkout.secondary_image_url ? (
                <BeRealPreview
                  primaryUri={todayWorkout.image_url}
                  secondaryUri={todayWorkout.secondary_image_url!}
                />
              ) : (
                <Image source={{ uri: todayWorkout.image_url }} style={styles.workoutImage} />
              )}
            </View>
            {todayWorkout.caption ? (
              <ThemedText style={[styles.caption, { color: colors.textMuted }]}>{todayWorkout.caption}</ThemedText>
            ) : null}
            <Pressable style={[styles.backButton, { borderColor: colors.tint }]} onPress={() => router.back()}>
              <ThemedText style={[styles.backButtonText, { color: colors.tint }]}>Back to Home</ThemedText>
            </Pressable>
          </View>
        ) : !pendingPhotoUri ? (
          <View style={styles.formSection}>
            <ThemedText type="subtitle" style={[styles.formTitle, { color: colors.text }]}>
              Post today&apos;s workout
            </ThemedText>
            <ThemedText style={[styles.formHint, { color: colors.textMuted }]}>
              Take a photo of your workout and a quick selfie. One post per day.
            </ThemedText>

            <Pressable
              onPress={handleTakePhoto}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.tint, shadowOpacity: isDark ? 0.3 : 0.15 },
              ]}
            >
              <ThemedText style={styles.primaryButtonText}>Take photo</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.formSection}>
            <ThemedText type="subtitle" style={[styles.formTitle, { color: colors.text }]}>
              Add a caption (optional)
            </ThemedText>
            <View style={[styles.imageWrap, { backgroundColor: colors.card, shadowOpacity: isDark ? 0.2 : 0.1, }]}>
              {pendingSecondaryUri ? (
                <BeRealPreview primaryUri={pendingPhotoUri!} secondaryUri={pendingSecondaryUri!} />
              ) : (
                <Image source={{ uri: pendingPhotoUri! }} style={styles.workoutImage} />
              )}
            </View>
            <View style={styles.retakeRow}>
              <Pressable
                style={[styles.retakeButton, {  }]}
                onPress={() => { setPendingPhotoUri(null); setPendingSecondaryUri(null); }}
                disabled={uploading}
              >
                <ThemedText style={[styles.retakeButtonText, { color: colors.textMuted }]}>Retake both photos</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Caption (optional)</ThemedText>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, color: colors.text },
              ]}
              placeholder="What did you do?"
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              editable={!uploading}
            />

            {/* Visibility toggle */}
            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Who can see this</ThemedText>
            <View style={styles.visibilityRow}>
              <Pressable
                style={[
                  styles.visibilityChip,
                  {  backgroundColor: colors.card },
                  visibility === 'friends' && { borderColor: colors.tint, backgroundColor: colors.tint + '18' },
                ]}
                onPress={() => setVisibility('friends')}
                disabled={uploading}
              >
                <Ionicons name="people" size={18} color={visibility === 'friends' ? colors.tint : colors.textMuted} />
                <ThemedText
                  style={[styles.visibilityLabel, { color: visibility === 'friends' ? colors.tint : colors.text }]}
                >
                  Friends
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.visibilityChip,
                  {  backgroundColor: colors.card },
                  visibility === 'public' && { borderColor: colors.tint, backgroundColor: colors.tint + '18' },
                ]}
                onPress={() => setVisibility('public')}
                disabled={uploading}
              >
                <Ionicons name="globe" size={18} color={visibility === 'public' ? colors.tint : colors.textMuted} />
                <ThemedText
                  style={[styles.visibilityLabel, { color: visibility === 'public' ? colors.tint : colors.text }]}
                >
                  Public
                </ThemedText>
              </Pressable>
            </View>

            {/* Tag friends */}
            <Pressable
              style={[styles.tagToggle, {  backgroundColor: colors.card }]}
              onPress={() => setShowTagPicker(!showTagPicker)}
              disabled={uploading}
            >
              <Ionicons name="people-outline" size={18} color={colors.tint} />
              <ThemedText style={[styles.tagToggleText, { color: colors.text }]}>
                {taggedFriends.size > 0
                  ? `${taggedFriends.size} friend${taggedFriends.size > 1 ? 's' : ''} tagged`
                  : 'Tag friends'}
              </ThemedText>
              <Ionicons name={showTagPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </Pressable>

            {showTagPicker && (
              <View style={[styles.tagList, {  backgroundColor: colors.card }]}>
                {friends.length === 0 ? (
                  <ThemedText style={[styles.tagEmptyHint, { color: colors.textMuted }]}>
                    Add friends first to tag them
                  </ThemedText>
                ) : (
                  <ScrollView
                    style={styles.tagListScroll}
                    contentContainerStyle={styles.tagListContent}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled
                  >
                    {friends.map((friend) => {
                      const isTagged = taggedFriends.has(friend.id)
                      return (
                        <Pressable
                          key={friend.id}
                          style={[styles.tagRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}
                          onPress={() => {
                            setTaggedFriends((prev) => {
                              const next = new Set(prev)
                              if (next.has(friend.id)) next.delete(friend.id)
                              else next.add(friend.id)
                              return next
                            })
                          }}
                        >
                          <View style={[styles.tagAvatar, { backgroundColor: colors.tint + '20' }]}>
                            {friend.avatar_url ? (
                              <Image source={{ uri: friend.avatar_url }} style={styles.tagAvatarImg} />
                            ) : (
                              <ThemedText style={[styles.tagInitials, { color: colors.tint }]}>
                                {getInitials(friend.display_name)}
                              </ThemedText>
                            )}
                          </View>
                          <ThemedText style={[styles.tagName, { color: colors.text }]}>
                            {friend.display_name || 'No name'}
                          </ThemedText>
                          <Ionicons
                            name={isTagged ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={isTagged ? colors.tint : colors.textMuted}
                          />
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            <Pressable
              onPress={handlePost}
              disabled={uploading}
              style={[
                styles.primaryButton,
                { backgroundColor: colors.tint, shadowOpacity: isDark ? 0.3 : 0.15 },
              ]}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>Post workout</ThemedText>
              )}
            </Pressable>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      {levelUpCelebration && (
        <CelebrationModal
          visible={showLevelUp}
          icon={levelUpCelebration.level.emoji}
          title="Level up!"
          description={`You reached ${levelUpCelebration.level.title}!`}
          onDismiss={() => {
            setShowLevelUp(false)
            setLevelUpCelebration(null)
          }}
          accentColor={levelUpCelebration.level.color}
        />
      )}

      <Modal visible={cameraOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCameraOpen(false)}>
        <CameraCapture
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
          facing={cameraMode === 'primary' ? 'back' : 'front'}
          quality={0.8}
        />
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  gateScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
  },
  gateCard: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  gateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  gateTitle: { textAlign: 'center', marginBottom: 10 },
  gateBody: {
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 15,
    marginBottom: 8,
    paddingHorizontal: 4,
    maxWidth: 320,
  },
  gatePrimaryBtn: {
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 20,
  },
  gateSecondaryBtn: {
    alignSelf: 'stretch',
    marginTop: 12,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12 },
  doneSection: { alignItems: 'center' },
  doneTitle: { marginBottom: 8 },
  doneHint: { textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  // Rectangular (4:5) like BeReal so photos aren't cropped
  imageWrap: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  workoutImage: { width: '100%', height: '100%' },
  dualPreview: { width: '100%', height: '100%', position: 'relative' },
  dualPreviewMain: { width: '100%', height: '100%' },
  dualPreviewSecondaryWrap: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: '30%',
    aspectRatio: 4 / 5,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
  },
  dualPreviewSecondary: { width: '100%', height: '100%' },
  retakeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 16 },
  caption: { marginBottom: 24, textAlign: 'center' },
  backButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12},
  backButtonText: { fontSize: 16, fontWeight: '600' },
  formSection: {},
  formTitle: { marginBottom: 8 },
  formHint: { marginBottom: 24, lineHeight: 22 },
  retakeButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderRadius: 8,
  },
  retakeButtonText: { fontSize: 14 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 24,
    letterSpacing: 0.1,
  },
  tagToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  tagToggleText: { flex: 1, fontSize: 15 },
  tagList: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    maxHeight: 280,
  },
  tagListScroll: {
    maxHeight: 280,
  },
  tagListContent: {
    paddingBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  tagAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tagAvatarImg: { width: 34, height: 34 },
  tagInitials: { fontSize: 13, fontWeight: '600' },
  tagName: { flex: 1, fontSize: 15 },
  tagEmptyHint: { padding: 14, fontSize: 14, textAlign: 'center' },
  visibilityRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  visibilityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  visibilityLabel: { fontSize: 14, fontWeight: '700' },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
})
