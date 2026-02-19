import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
import type { Workout } from '@/types/workout'

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

export default function LogWorkoutScreen() {
  const { session, profile, refreshProfile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  // Photo taken but not yet posted (caption step)
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  // Achievement celebration
  const [celebrationQueue, setCelebrationQueue] = useState<UserAchievementWithDetails[]>([])
  const [showCelebration, setShowCelebration] = useState(false)
  const currentCelebration = celebrationQueue[0] ?? null

  // Level-up celebration
  const [levelUpCelebration, setLevelUpCelebration] = useState<UserLevel | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)

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
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('workout_date', today)
        .maybeSingle()
      if (!cancelled && data) setTodayWorkout(data as Workout)
      if (!cancelled) setLoading(false)
    })()
    // Load friends for tagging
    getFriends(session.user.id).then(setFriends).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session, today])

  const handleTakePhoto = async () => {
    if (!session) return
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a workout photo.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      cameraType: ImagePicker.CameraType.front,
    })
    if (result.canceled || !result.assets[0]?.uri) return

    setPendingPhotoUri(result.assets[0].uri)
  }

  const handlePost = async () => {
    if (!session || !pendingPhotoUri) return
    setUploading(true)
    const uploadResult = await uploadWorkoutImage(session.user.id, pendingPhotoUri)
    if ('error' in uploadResult) {
      setUploading(false)
      Alert.alert('Upload failed', uploadResult.error.message)
      return
    }

    const { data: workoutRow, error } = await supabase
      .from('workouts')
      .insert({
        user_id: session.user.id,
        workout_date: today,
        image_url: uploadResult.url,
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
    setCaption('')
    await refreshProfile()
    setTodayWorkout({
      id: '',
      user_id: session.user.id,
      workout_date: today,
      image_url: uploadResult.url,
      caption: caption.trim() || null,
      created_at: new Date().toISOString(),
    })

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

      // Check for level-up
      const newXP = computeXP(
        {
          workouts_count: (profile?.workouts_count ?? 0) + 1,
          streak: (profile?.streak ?? 0) + 1,
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
              <Image source={{ uri: todayWorkout.image_url }} style={styles.workoutImage} />
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
              Take a photo of your workout. One post per day.
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
              <Image source={{ uri: pendingPhotoUri }} style={styles.workoutImage} />
            </View>
            <Pressable
              style={[styles.retakeButton, { borderColor: colors.tabBarBorder }]}
              onPress={() => setPendingPhotoUri(null)}
              disabled={uploading}
            >
              <ThemedText style={[styles.retakeButtonText, { color: colors.textMuted }]}>Retake photo</ThemedText>
            </Pressable>

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
                  friends.map((friend) => {
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
                  })
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12 },
  doneSection: { alignItems: 'center' },
  doneTitle: { marginBottom: 8 },
  doneHint: { textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  imageWrap: { width: '100%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  workoutImage: { width: '100%', height: '100%' },
  caption: { marginBottom: 24, textAlign: 'center' },
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
    maxHeight: 220,
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
