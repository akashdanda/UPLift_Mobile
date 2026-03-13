import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
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
import { SafeAreaView } from 'react-native-safe-area-context'

import { CameraCapture } from '@/components/camera-capture'
import { CelebrationModal } from '@/components/celebration-modal'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  checkAndUpdateAchievements,
  createAchievementFeedPost,
  markAchievementNotified,
} from '@/lib/achievements'
import { getFriends, type FriendWithProfile } from '@/lib/friends'
import { computeXP, getLevelFromXP } from '@/lib/levels'
import { supabase } from '@/lib/supabase'
import { addWorkoutTags } from '@/lib/tags'
import { uploadWorkoutImage } from '@/lib/workout-upload'
import { ACHIEVEMENT_CATEGORIES, type UserAchievementWithDetails } from '@/types/achievement'
import type { UserLevel } from '@/types/level'
import { WORKOUT_TYPES, type Workout, type WorkoutType } from '@/types/workout'

function BeRealPreview({ primaryUri, secondaryUri }: { primaryUri: string; secondaryUri: string }) {
  const [frontImage, setFrontImage] = useState<'primary' | 'secondary'>('primary')

  const mainUri = frontImage === 'primary' ? primaryUri : secondaryUri
  const overlayUri = frontImage === 'primary' ? secondaryUri : primaryUri

  const toggle = () => {
    setFrontImage((f) => (f === 'primary' ? 'secondary' : 'primary'))
  }

  return (
    <View style={styles.dualPreview}>
      <Pressable style={{ width: '100%', height: '100%' }} onPress={toggle}>
        <Image source={{ uri: mainUri }} style={styles.dualPreviewMain} />
      </Pressable>
      <Pressable style={styles.dualPreviewSecondaryWrap} onPress={toggle}>
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

/** Sunday of current week (YYYY-MM-DD) and next Sunday for range. */
function getWeekRange(): { start: string; end: string } {
  const d = new Date()
  const day = d.getDay()
  const sunday = new Date(d)
  sunday.setDate(d.getDate() - day)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`,
    end: `${saturday.getFullYear()}-${pad(saturday.getMonth() + 1)}-${pad(saturday.getDate())}`,
  }
}

export default function LogWorkoutScreen() {
  const { session, profile, refreshProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  // Photo(s) taken but not yet posted (caption step). BeReal-style: primary + optional secondary.
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  const [pendingSecondaryUri, setPendingSecondaryUri] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState<'primary' | 'secondary'>('primary')
  // Achievement celebration
  const [celebrationQueue, setCelebrationQueue] = useState<UserAchievementWithDetails[]>([])
  const [showCelebration, setShowCelebration] = useState(false)
  const currentCelebration = celebrationQueue[0] ?? null

  // Level-up celebration
  const [levelUpCelebration, setLevelUpCelebration] = useState<UserLevel | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)

  // Workout type (cardio, strength, sport, rest)
  const [workoutType, setWorkoutType] = useState<WorkoutType>('strength')
  const [restCountThisWeek, setRestCountThisWeek] = useState(0)

  // Friend tagging
  const [friends, setFriends] = useState<FriendWithProfile[]>([])
  const [taggedFriends, setTaggedFriends] = useState<Set<string>>(new Set())
  const [showTagPicker, setShowTagPicker] = useState(false)

  const handleDismissCelebration = () => {
    setCelebrationQueue((prev) => {
      if (prev.length <= 1) {
        setShowCelebration(false)
        // Show level-up celebration after all achievements are shown
        if (levelUpCelebration) {
          setTimeout(() => setShowLevelUp(true), 300)
        }
        return []
      }
      return prev.slice(1)
    })
  }

  const today = getTodayLocalDate()

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from('workouts')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('workout_date', today)
          .maybeSingle(),
        (() => {
          const { start, end } = getWeekRange()
          return supabase
            .from('workouts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', session.user.id)
            .eq('workout_type', 'rest')
            .gte('workout_date', start)
            .lte('workout_date', end)
        })(),
      ])
      if (!cancelled && data) setTodayWorkout(data as Workout)
      if (!cancelled && count !== null) setRestCountThisWeek(count)
      if (!cancelled) setLoading(false)
    })()
    getFriends(session.user.id).then(setFriends).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, today])

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
    if (!session || !pendingPhotoUri) return
    if (workoutType === 'rest' && restCountThisWeek >= 2) {
      Alert.alert(
        'Limit reached',
        'You can only log 2 active rest days per week. Choose another type or wait until next week.'
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
        workout_date: today,
        image_url: uploadResult.url,
        secondary_image_url: secondaryUrl,
        workout_type: workoutType,
        caption: caption.trim() || null,
      })
      .select()
      .single()

    setUploading(false)
    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already logged', "You've already logged a workout for today.")
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
      workout_date: today,
      image_url: uploadResult.url,
      secondary_image_url: secondaryUrl ?? null,
      workout_type: workoutType,
      caption: caption.trim() || null,
      created_at: new Date().toISOString(),
    })
    if (workoutType === 'rest') setRestCountThisWeek((c) => c + 1)

    // Check achievements after logging workout
    try {
      const newlyUnlocked = await checkAndUpdateAchievements(session.user.id)
      if (newlyUnlocked.length > 0) {
        const displayName = profile?.display_name || 'Someone'
        for (const ach of newlyUnlocked) {
          await createAchievementFeedPost(
            session.user.id,
            ach.achievement_id,
            `${ach.icon} ${displayName} just unlocked "${ach.name}"!`
          )
          await markAchievementNotified(session.user.id, ach.achievement_id)
        }
        setCelebrationQueue(newlyUnlocked)
        setShowCelebration(true)
      }

      // Check for level-up (rest does not increase streak)
      const newXP = computeXP(
        {
          workouts_count: (profile?.workouts_count ?? 0) + 1,
          streak: workoutType === 'rest' ? (profile?.streak ?? 0) : (profile?.streak ?? 0) + 1,
          groups_count: profile?.groups_count ?? 0,
          friends_count: profile?.friends_count ?? 0,
        },
        newlyUnlocked.length
      )
      const newLevel = getLevelFromXP(newXP)
      if (newLevel.level.tier !== oldLevel.level.tier) {
        // Queue level-up celebration (shows after achievement celebrations)
        setLevelUpCelebration(newLevel)
        if (newlyUnlocked.length === 0) {
          setShowLevelUp(true)
        }
      }
    } catch {
      // Don't block workout posting for achievement errors
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
            <View style={[styles.imageWrap, { backgroundColor: colors.card }]}>
              {todayWorkout.secondary_image_url ? (
                <BeRealPreview
                  primaryUri={todayWorkout.image_url}
                  secondaryUri={todayWorkout.secondary_image_url!}
                />
              ) : (
                <Image source={{ uri: todayWorkout.image_url }} style={styles.workoutImage} />
              )}
            </View>
            <View style={styles.doneTypeRow}>
              <ThemedText style={styles.doneTypeEmoji}>
                {WORKOUT_TYPES.find((t) => t.value === (todayWorkout.workout_type ?? 'strength'))?.emoji ?? '💪'}
              </ThemedText>
              {todayWorkout.caption ? (
                <ThemedText style={[styles.caption, { color: colors.textMuted }]}>{todayWorkout.caption}</ThemedText>
              ) : null}
            </View>
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
              style={[styles.primaryButton, { backgroundColor: colors.tint }]}
              onPress={handleTakePhoto}
            >
              <ThemedText style={styles.primaryButtonText}>Take photo</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.formSection}>
            <ThemedText type="subtitle" style={[styles.formTitle, { color: colors.text }]}>
              Add a caption (optional)
            </ThemedText>
            <View style={[styles.imageWrap, { backgroundColor: colors.card }]}>
              {pendingSecondaryUri ? (
                <BeRealPreview primaryUri={pendingPhotoUri!} secondaryUri={pendingSecondaryUri!} />
              ) : (
                <Image source={{ uri: pendingPhotoUri! }} style={styles.workoutImage} />
              )}
            </View>
            <View style={styles.retakeRow}>
              <Pressable
                style={[styles.retakeButton, { borderColor: colors.tabBarBorder }]}
                onPress={() => { setPendingPhotoUri(null); setPendingSecondaryUri(null); }}
                disabled={uploading}
              >
                <ThemedText style={[styles.retakeButtonText, { color: colors.textMuted }]}>Retake both photos</ThemedText>
              </Pressable>
            </View>

            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Workout type</ThemedText>
            <View style={styles.workoutTypeRow}>
              {WORKOUT_TYPES.map((t) => (
                <Pressable
                  key={t.value}
                  style={[
                    styles.workoutTypeChip,
                    { borderColor: colors.tabBarBorder, backgroundColor: colors.card },
                    workoutType === t.value && { borderColor: colors.tint, backgroundColor: colors.tint + '18' },
                  ]}
                  onPress={() => setWorkoutType(t.value as WorkoutType)}
                  disabled={uploading}
                >
                  <ThemedText style={styles.workoutTypeEmoji}>{t.emoji}</ThemedText>
                  <ThemedText
                    style={[styles.workoutTypeLabel, { color: workoutType === t.value ? colors.tint : colors.text }]}
                    numberOfLines={1}
                  >
                    {t.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            {workoutType === 'rest' && (
              <ThemedText style={[styles.restHint, { color: colors.textMuted }]}>
                You have {Math.max(0, 2 - restCountThisWeek)} rest day{2 - restCountThisWeek === 1 ? '' : 's'} left this week. Active rest pauses your streak.
              </ThemedText>
            )}

            <ThemedText style={[styles.label, { color: colors.textMuted }]}>Caption (optional)</ThemedText>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, color: colors.text, borderColor: colors.tabBarBorder },
              ]}
              placeholder="What did you do?"
              placeholderTextColor={colors.textMuted}
              value={caption}
              onChangeText={setCaption}
              editable={!uploading}
            />

            {/* Tag friends */}
            <Pressable
              style={[styles.tagToggle, { borderColor: colors.tabBarBorder, backgroundColor: colors.card }]}
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
              <View style={[styles.tagList, { borderColor: colors.tabBarBorder, backgroundColor: colors.card }]}>
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
                          style={[styles.tagRow, { borderBottomColor: colors.tabBarBorder }]}
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
              style={[styles.primaryButton, { backgroundColor: colors.tint }]}
              onPress={handlePost}
              disabled={uploading}
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

      {/* Achievement celebration */}
      {currentCelebration && (
        <CelebrationModal
          visible={showCelebration}
          icon={currentCelebration.icon}
          title={currentCelebration.name}
          description={currentCelebration.description}
          onDismiss={handleDismissCelebration}
          accentColor={
            ACHIEVEMENT_CATEGORIES[currentCelebration.category as keyof typeof ACHIEVEMENT_CATEGORIES]?.color
          }
        />
      )}

      {/* Level-up celebration */}
      {levelUpCelebration && (
        <CelebrationModal
          visible={showLevelUp}
          icon={levelUpCelebration.level.emoji}
          title={`Level Up!`}
          description={`You reached ${levelUpCelebration.level.title}!`}
          onDismiss={() => {
            setShowLevelUp(false)
            setLevelUpCelebration(null)
          }}
          accentColor={levelUpCelebration.level.color}
        />
      )}

      <Modal visible={cameraOpen} animationType="slide" presentationStyle="fullScreen">
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
  doneTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  doneTypeEmoji: { fontSize: 18 },
  caption: { flex: 1, marginBottom: 24, textAlign: 'center' },
  backButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1 },
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
    borderWidth: 1,
  },
  retakeButtonText: { fontSize: 14 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  workoutTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  workoutTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    minWidth: '45%',
  },
  workoutTypeEmoji: { fontSize: 18 },
  workoutTypeLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  restHint: { fontSize: 12, marginBottom: 16, lineHeight: 18 },
  input: {
    borderWidth: 1,
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
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  tagToggleText: { flex: 1, fontSize: 15 },
  tagList: {
    borderWidth: 1,
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
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
})
