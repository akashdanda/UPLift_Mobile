import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ReportModal } from '@/components/report-modal'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { getSpecialBadge } from '@/constants/special-badges'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { AchievementBadge } from '@/components/achievement-badge'
import { getUserAchievements } from '@/lib/achievements'
import { getHighlightsForProfile } from '@/lib/highlights'
import { getUserLevel } from '@/lib/levels'
import { supabase } from '@/lib/supabase'
import { acceptFriendRequestByUserId, getFriendshipStatus, sendFriendRequest } from '@/lib/friends'
import { ACHIEVEMENT_CATEGORIES, type UserAchievementWithDetails } from '@/types/achievement'
import type { HighlightForProfile } from '@/types/highlight'
import type { UserLevel } from '@/types/level'
import type { Profile } from '@/types/profile'

function getInitials(displayName: string | null): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  return '?'
}

export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [monthWorkoutDates, setMonthWorkoutDates] = useState<Set<string>>(new Set())
  const [monthRestDates, setMonthRestDates] = useState<Set<string>>(new Set())
  const [highlights, setHighlights] = useState<HighlightForProfile[]>([])
  const [isImageModalVisible, setIsImageModalVisible] = useState(false)
  const [achievements, setAchievements] = useState<UserAchievementWithDetails[]>([])
  const [selectedAchievement, setSelectedAchievement] = useState<UserAchievementWithDetails | null>(null)
  const [friendLevel, setFriendLevel] = useState<UserLevel | null>(null)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends'>('none')
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [nudgeLoading, setNudgeLoading] = useState(false)
  const isFriend = friendStatus === 'friends'

  // Calendar calculations
  const today = useMemo(() => new Date(), [])
  const todayDateString = useMemo(() => {
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [today])
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
      }).format(today),
    [today]
  )

  const signupDateString = useMemo(() => {
    if (!profile?.created_at) return null
    return profile.created_at.slice(0, 10)
  }, [profile?.created_at])

  // Fetch friend's workouts for the calendar
  const fetchMonthWorkouts = useCallback(async () => {
    if (!id) return
    const y = year
    const m = String(month + 1).padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = `${y}-${m}-${String(daysInMonth).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('workouts')
      .select('workout_date, workout_type')
      .eq('user_id', id)
      .gte('workout_date', start)
      .lte('workout_date', end)

    if (error) return

    const dates = new Set<string>()
    const restDates = new Set<string>()
    for (const row of data ?? []) {
      const r = row as { workout_date?: string | null; workout_type?: string | null }
      if (typeof r.workout_date === 'string' && r.workout_date.length >= 10) {
        const dateStr = r.workout_date.slice(0, 10)
        dates.add(dateStr)
        if (r.workout_type === 'rest') restDates.add(dateStr)
      }
    }
    setMonthWorkoutDates(dates)
    setMonthRestDates(restDates)
  }, [id, year, month, daysInMonth])

  // Fetch profile
  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
      if (cancelled) return
      if (error || !data) {
        setProfile(null)
      } else {
        setProfile(data as Profile)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // Fetch workouts + achievements once profile is loaded
  useEffect(() => {
    void fetchMonthWorkouts()
  }, [fetchMonthWorkouts])

  useEffect(() => {
    if (!id) return
    getUserAchievements(id).then(setAchievements).catch(() => {})
    getUserLevel(id).then(setFriendLevel).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!session || !id) return
    getFriendshipStatus(session.user.id, id as string)
      .then(setFriendStatus)
      .catch(() => setFriendStatus('none'))
  }, [session, id])

  useEffect(() => {
    if (!id) return
    getHighlightsForProfile(id).then(setHighlights).catch(() => {})
  }, [id])

  const displayName = profile?.display_name || 'Athlete'
  const specialBadge = getSpecialBadge(profile?.display_name)
  const initials = useMemo(() => getInitials(profile?.display_name ?? null), [profile?.display_name])
  const showAvatarImage = !!profile?.avatar_url

  // Zoom modal state
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1)
      } else if (scale.value > 3) {
        scale.value = withSpring(3)
      }
      savedScale.value = scale.value
    })

  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    }
  })

  const handleOpenModal = () => {
    if (showAvatarImage) {
      setIsImageModalVisible(true)
      scale.value = 1
      savedScale.value = 1
    }
  }

  const handleCloseModal = () => {
    setIsImageModalVisible(false)
    scale.value = withTiming(1)
    savedScale.value = 1
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

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ThemedText style={{ color: colors.textMuted }}>Profile not found.</ThemedText>
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
        {/* Header: Avatar, Name, Bio */}
        <ThemedView style={styles.header}>
          {/* Report flag — top right corner */}
          {session && id !== session.user.id && (
            <Pressable
              style={styles.reportFlag}
              onPress={() => setReportModalVisible(true)}
              hitSlop={12}
            >
              <Ionicons name="flag-outline" size={20} color={colors.textMuted} />
            </Pressable>
          )}
          <Pressable onPress={handleOpenModal} disabled={!showAvatarImage}>
            <View
              style={[
                styles.avatarRing,
                {
                  borderColor: (friendLevel?.level.color ?? colors.tint) + '50',
                  shadowColor: friendLevel?.level.color ?? colors.tint,
                  },
              ]}
            >
              <View style={[styles.avatarWrap, { backgroundColor: colors.tint + '25' }]}>
                {showAvatarImage ? (
                  <Image source={{ uri: profile.avatar_url! }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarInitialsWrap}>
                    <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>{initials}</ThemedText>
                  </View>
                )}
              </View>
            </View>
          </Pressable>

          {/* Level badge */}
          {friendLevel && (
            <View style={[styles.levelBadge, { backgroundColor: friendLevel.level.glowColor }]}>
              <ThemedText style={styles.levelEmoji}>{friendLevel.level.emoji}</ThemedText>
              <ThemedText style={[styles.levelTitle, { color: friendLevel.level.color }]}>
                {friendLevel.level.title}
              </ThemedText>
            </View>
          )}

          <ThemedText type="title" style={[styles.displayName, { color: colors.text }]}>
            {displayName}
          </ThemedText>
          {specialBadge && (
            <View style={[styles.specialBadge, { backgroundColor: specialBadge.bgColor }]}>
              <ThemedText style={styles.specialBadgeEmoji}>{specialBadge.emoji}</ThemedText>
              <ThemedText style={[styles.specialBadgeLabel, { color: specialBadge.color }]}>
                {specialBadge.label}
              </ThemedText>
            </View>
          )}
          {profile.bio && (
            <ThemedText style={[styles.bio, { color: colors.textMuted }]}>{profile.bio}</ThemedText>
          )}

          {/* Action buttons */}
          {session && id !== session.user.id && (
            <View style={styles.actionButtonsRow}>
              {friendStatus === 'none' && (
                <Pressable
                  style={[styles.challengeButton, { backgroundColor: colors.tint }]}
                  disabled={friendActionLoading}
                  onPress={async () => {
                    setFriendActionLoading(true)
                    const { error } = await sendFriendRequest(session.user.id, id as string)
                    if (!error) setFriendStatus('pending_sent')
                    setFriendActionLoading(false)
                  }}
                >
                  <ThemedText style={styles.challengeButtonText}>
                    {friendActionLoading ? 'Sending...' : 'Add Friend'}
                  </ThemedText>
                </Pressable>
              )}
              {friendStatus === 'pending_sent' && (
                <View style={[styles.reportButton, { borderColor: colors.textMuted }]}>
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <ThemedText style={[styles.reportButtonText, { color: colors.textMuted }]}>Request Sent</ThemedText>
                </View>
              )}
              {friendStatus === 'pending_received' && (
                <Pressable
                  style={[styles.challengeButton, { backgroundColor: '#22C55E' }]}
                  disabled={friendActionLoading}
                  onPress={async () => {
                    setFriendActionLoading(true)
                    const { error } = await acceptFriendRequestByUserId(session.user.id, id as string)
                    if (!error) setFriendStatus('friends')
                    setFriendActionLoading(false)
                  }}
                >
                  <ThemedText style={styles.challengeButtonText}>Accept Request</ThemedText>
                </Pressable>
              )}
              {isFriend && (
                <Pressable
                  style={[styles.challengeButton, { backgroundColor: colors.tint }]}
                  onPress={() => router.push(`/create-duel?friendId=${id}` as Href)}
                >
                  <ThemedText style={styles.challengeButtonText} numberOfLines={1}>
                    Challenge
                  </ThemedText>
                </Pressable>
              )}
              {isFriend && (
                <Pressable
                  style={[styles.reportButton, { borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
                  disabled={nudgeLoading}
                  onPress={async () => {
                    if (!session || !id) return
                    setNudgeLoading(true)
                    try {
                      const { data, error } = await supabase.functions.invoke('send-workout-nudge', {
                        body: { target_user_id: id },
                      })
                      if (error) {
                        const msg = error.message || ''
                        if (msg.includes('non-2xx') || msg.includes('FunctionsHttpError') || msg.includes('Failed to send')) {
                          Alert.alert('Nudge unavailable', 'This feature is temporarily offline. Try again later.')
                        } else {
                          Alert.alert('Couldn’t send nudge', msg || 'Please try again.')
                        }
                        return
                      }

                      if (data?.sent === 1) {
                        Alert.alert('Nudge sent', 'They’ll get a reminder to log a workout.')
                      } else if (data?.reason === 'Already worked out today') {
                        Alert.alert('No need to nudge', 'They already logged a workout today.')
                      } else if (data?.reason === 'Already nudged today') {
                        Alert.alert('Already nudged', 'You can nudge them again tomorrow.')
                      } else if (data?.reason === 'Not friends') {
                        Alert.alert('Nudge unavailable', 'You can only nudge friends.')
                      } else {
                        Alert.alert('Couldn’t send nudge', String(data?.reason ?? 'Please try again.'))
                      }
                    } catch (e) {
                      Alert.alert('Couldn’t send nudge', e instanceof Error ? e.message : 'Please try again.')
                    } finally {
                      setNudgeLoading(false)
                    }
                  }}
                >
                  <Ionicons name="notifications-outline" size={16} color={colors.text} />
                  <ThemedText style={[styles.reportButtonText, { color: colors.text }]} numberOfLines={1}>
                    {nudgeLoading ? 'Nudging…' : 'Nudge'}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          )}
        </ThemedView>

        {/* Highlights */}
        {highlights.some((h) => h.workouts_count > 0) && (
          <View style={styles.highlightsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.highlightsScroll}
            >
              {highlights.filter((h) => h.workouts_count > 0).map((h) => (
                <Pressable
                  key={h.id}
                  onPress={() => router.push({ pathname: '/highlight-detail', params: { id: h.id } })}
                  style={[styles.highlightCircleWrap, { borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
                >
                  <View style={[styles.highlightCircle, { backgroundColor: colors.cardElevated, overflow: 'hidden' }]}>
                    {h.cover_image_url ? (
                      <Image source={{ uri: h.cover_image_url }} style={styles.highlightCircleImage} />
                    ) : (
                      <Ionicons name="images-outline" size={28} color={colors.textMuted} />
                    )}
                  </View>
                  <ThemedText style={[styles.highlightLabel, { color: colors.text }]} numberOfLines={1}>
                    {h.name}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Activity Calendar */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Activity
          </ThemedText>
          <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
            <ThemedText style={[styles.calendarMonthLabel, { color: colors.text }]}>
              {monthLabel}
            </ThemedText>
            <View style={styles.calendarWeekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
                <ThemedText key={`weekday-${idx}`} style={[styles.calendarWeekday, { color: colors.textMuted }]}>
                  {d}
                </ThemedText>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <View key={`empty-${idx}`} style={styles.calendarDayCell} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1
                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isToday = iso === todayDateString
                const isPast = iso < todayDateString
                const hasWorkout = monthWorkoutDates.has(iso)
                const isOnOrAfterSignup = !signupDateString || iso >= signupDateString

                // Check if there are any workouts before this day (indicating a streak was started)
                const hasAnyPreviousWorkout = Array.from(monthWorkoutDates).some((date) => date < iso)

                let statusStyle = styles.calendarDayNeutral
                let isColored = false

                if (hasWorkout) {
                  if (monthRestDates.has(iso)) {
                    statusStyle = styles.calendarDayRest
                  } else {
                    statusStyle = styles.calendarDayCompleted
                  }
                  isColored = true
                } else if (isOnOrAfterSignup && isPast && hasAnyPreviousWorkout) {
                  statusStyle = styles.calendarDayMissed
                  isColored = true
                }

                return (
                  <View key={iso} style={styles.calendarDayCell}>
                    <View style={[styles.calendarDayCircle, statusStyle]}>
                      <ThemedText
                        style={[
                          styles.calendarDayText,
                          isColored ? { color: '#fff' } : { color: colors.text },
                        ]}
                      >
                        {day}
                      </ThemedText>
                    </View>
                  </View>
                )
              })}
            </View>
            <View style={styles.calendarLegendRow}>
              <View style={styles.calendarLegendItem}>
                <View style={[styles.calendarLegendDot, styles.calendarDayCompleted]} />
                <ThemedText style={[styles.calendarLegendLabel, { color: colors.textMuted }]}>
                  Worked out
                </ThemedText>
              </View>
              <View style={styles.calendarLegendItem}>
                <View style={[styles.calendarLegendDot, styles.calendarDayRest]} />
                <ThemedText style={[styles.calendarLegendLabel, { color: colors.textMuted }]}>
                  Rest day
                </ThemedText>
              </View>
              <View style={styles.calendarLegendItem}>
                <View style={[styles.calendarLegendDot, styles.calendarDayMissed]} />
                <ThemedText style={[styles.calendarLegendLabel, { color: colors.textMuted }]}>
                  Missed day
                </ThemedText>
              </View>
            </View>
          </View>
        </ThemedView>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile.workouts_count ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
              Workouts
            </ThemedText>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile.longest_streak ?? 0}
            </ThemedText>
            <ThemedText
              style={[styles.statLabel, { color: colors.textMuted }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Best streak
            </ThemedText>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile.streak ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
              Streak
            </ThemedText>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile.groups_count ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
              Groups
            </ThemedText>
          </View>
        </View>

        {/* Achievements */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Achievements
          </ThemedText>
          {achievements.length === 0 ? (
            <View style={[styles.badgesContainer, { backgroundColor: colors.card, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
              <ThemedText style={[styles.emptyBadgesText, { color: colors.textMuted }]}>
                No achievements yet.
              </ThemedText>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.achievementsScroll}
            >
              {achievements.map((ach) => {
                const progress = Math.min(ach.progress_value / ach.requirement_value, 1)
                const catMeta = ACHIEVEMENT_CATEGORIES[ach.category as keyof typeof ACHIEVEMENT_CATEGORIES]
                return (
                  <Pressable
                    key={ach.achievement_id}
                    onPress={() => setSelectedAchievement(ach)}
                    style={[
                      styles.achievementCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: ach.unlocked
                          ? catMeta?.color ?? colors.tint
                          : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                        borderWidth: ach.unlocked ? 1.5 : 1,
                        shadowColor: ach.unlocked ? catMeta?.color ?? colors.tint : 'transparent',
                        shadowOpacity: ach.unlocked ? 0.3 : 0,
                        shadowRadius: ach.unlocked ? 8 : 0,
                        elevation: ach.unlocked ? 4 : 0,
                      },
                    ]}
                  >
                    <AchievementBadge achievementKey={ach.key} size={48} locked={!ach.unlocked} />
                    <ThemedText
                      style={[
                        styles.achievementName,
                        { color: ach.unlocked ? colors.text : colors.textMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {ach.name}
                    </ThemedText>
                    {!ach.unlocked && (
                      <View style={styles.progressBarOuter}>
                        <View
                          style={[
                            styles.progressBarInner,
                            {
                              width: `${Math.round(progress * 100)}%`,
                              backgroundColor: catMeta?.color ?? colors.tint,
                            },
                          ]}
                        />
                      </View>
                    )}
                    {ach.unlocked && (
                      <View style={[styles.unlockedBadge, { backgroundColor: (catMeta?.color ?? colors.tint) + '20' }]}>
                        <ThemedText style={[styles.unlockedText, { color: catMeta?.color ?? colors.tint }]}>
                          ✓ Unlocked
                        </ThemedText>
                      </View>
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
          )}
        </ThemedView>
      </ScrollView>

      {/* Photo zoom modal */}
      <Modal
        visible={isImageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCloseModal}>
          <View style={styles.modalContent} pointerEvents="box-none">
            <Pressable onPress={(e) => e.stopPropagation()}>
              <GestureDetector gesture={pinchGesture}>
                <Animated.View style={[styles.zoomedImageContainer, animatedImageStyle]}>
                  {showAvatarImage && (
                    <Image
                      source={{ uri: profile.avatar_url! }}
                      style={styles.zoomedImage}
                      contentFit="cover"
                    />
                  )}
                </Animated.View>
              </GestureDetector>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Achievement detail modal */}
      <Modal
        visible={!!selectedAchievement}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAchievement(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedAchievement(null)}>
          <View style={styles.achievementDetailCard}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              {selectedAchievement && (() => {
                const catMeta = ACHIEVEMENT_CATEGORIES[
                  selectedAchievement.category as keyof typeof ACHIEVEMENT_CATEGORIES
                ]
                const progress = Math.min(
                  selectedAchievement.progress_value / selectedAchievement.requirement_value,
                  1
                )
                return (
                  <View style={[styles.achievementDetailInner, { backgroundColor: colors.card }]}>
                    <View
                      style={[
                        styles.achievementDetailIconWrap,
                        { backgroundColor: (catMeta?.color ?? colors.tint) + '15' },
                      ]}
                    >
                      <AchievementBadge achievementKey={selectedAchievement.key} size={72} locked={!selectedAchievement.unlocked} />
                    </View>
                    <ThemedText style={[styles.achievementDetailCategory, { color: catMeta?.color ?? colors.tint }]}>
                      {catMeta?.label ?? selectedAchievement.category}
                    </ThemedText>
                    <ThemedText style={[styles.achievementDetailName, { color: colors.text }]}>
                      {selectedAchievement.name}
                    </ThemedText>
                    <ThemedText style={[styles.achievementDetailDesc, { color: colors.textMuted }]}>
                      {selectedAchievement.description}
                    </ThemedText>
                    {!selectedAchievement.unlocked ? (
                      <View style={styles.achievementDetailProgressSection}>
                        <View style={[styles.achievementDetailProgressOuter, { backgroundColor: colors.cardElevated }]}>
                          <View
                            style={[
                              styles.achievementDetailProgressInner,
                              {
                                width: `${Math.round(progress * 100)}%`,
                                backgroundColor: catMeta?.color ?? colors.tint,
                              },
                            ]}
                          />
                        </View>
                        <ThemedText style={[styles.achievementDetailProgressText, { color: colors.textMuted }]}>
                          {selectedAchievement.progress_value} / {selectedAchievement.requirement_value}
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.achievementDetailUnlocked, { backgroundColor: (catMeta?.color ?? colors.tint) + '15' }]}>
                        <ThemedText style={[styles.achievementDetailUnlockedText, { color: catMeta?.color ?? colors.tint }]}>
                          ✓ Unlocked{selectedAchievement.unlocked_at
                            ? ` on ${new Date(selectedAchievement.unlocked_at).toLocaleDateString()}`
                            : ''}
                        </ThemedText>
                      </View>
                    )}
                    <Pressable
                      style={[styles.achievementDetailClose, { borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}
                      onPress={() => setSelectedAchievement(null)}
                    >
                      <ThemedText style={[styles.achievementDetailCloseText, { color: colors.text }]}>
                        Close
                      </ThemedText>
                    </Pressable>
                  </View>
                )
              })()}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Report Modal */}
      {session && id && id !== session.user.id && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          reporterId={session.user.id}
          reportedUserId={id}
          reportedEntityName={profile?.display_name || 'User'}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    position: 'relative',
  },
  reportFlag: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 4,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: 86,
    height: 86,
  },
  avatarInitialsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 8,
  },
  levelEmoji: { fontSize: 14 },
  levelTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  displayName: {
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  specialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 4,
  },
  specialBadgeEmoji: { fontSize: 13 },
  specialBadgeLabel: { fontSize: 12, fontWeight: '700' },
  bio: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 24,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  challengeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    },
  challengeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  reportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  reportButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  statBox: {
    flex: 1,
    minWidth: 64,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  highlightsSection: { marginBottom: 20 },
  highlightsScroll: { paddingHorizontal: 4, gap: 16, paddingRight: 20 },
  highlightCircleWrap: { alignItems: 'center', width: 76 },
  highlightCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  highlightCircleImage: { width: 72, height: 72, borderRadius: 36 },
  highlightLabel: { fontSize: 11, fontWeight: '600', marginTop: 6, maxWidth: 72, textAlign: 'center', letterSpacing: 0.2 },
  // Calendar styles
  calendarCard: {
    borderRadius: 14,
    padding: 16,
  },
  calendarMonthLabel: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calendarWeekday: {
    fontSize: 12,
    width: 24,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  calendarDayCell: {
    width: '14.2857%',
    alignItems: 'center',
    marginVertical: 4,
  },
  calendarDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayText: {
    fontSize: 12,
    fontWeight: '600',
  },
  calendarDayCompleted: {
    backgroundColor: '#22c55e',
  },
  calendarDayRest: {
    backgroundColor: '#eab308',
  },
  calendarDayMissed: {
    backgroundColor: '#ef4444',
  },
  calendarDayNeutral: {
    backgroundColor: 'transparent',
  },
  calendarLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  calendarLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  calendarLegendLabel: {
    fontSize: 12,
  },
  // Badges / Achievements
  badgesContainer: {
    borderRadius: 14,
    padding: 20,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBadgesText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  achievementsScroll: { paddingRight: 24, gap: 12 },
  achievementCard: {
    width: 118,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  achievementIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'visible',
  },
  achievementIcon: { fontSize: 26, lineHeight: 34 },
  achievementName: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 8, lineHeight: 15, paddingHorizontal: 4 },
  progressBarOuter: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressBarInner: { height: '100%', borderRadius: 2 },
  unlockedBadge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 8 },
  unlockedText: { fontSize: 10, fontWeight: '700' },
  // Achievement detail modal
  achievementDetailCard: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', padding: 32 },
  achievementDetailInner: { width: '100%', borderRadius: 24, padding: 28, alignItems: 'center' },
  achievementDetailIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'visible' },
  achievementDetailIcon: { fontSize: 38, lineHeight: 48 },
  achievementDetailCategory: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  achievementDetailName: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  achievementDetailDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  achievementDetailProgressSection: { width: '100%', marginBottom: 20 },
  achievementDetailProgressOuter: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  achievementDetailProgressInner: { height: '100%', borderRadius: 4 },
  achievementDetailProgressText: { fontSize: 13, textAlign: 'center', fontWeight: '600' },
  achievementDetailUnlocked: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12, marginBottom: 20 },
  achievementDetailUnlockedText: { fontSize: 14, fontWeight: '700' },
  achievementDetailClose: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12},
  achievementDetailCloseText: { fontSize: 15, fontWeight: '600' },
  // Photo zoom modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomedImageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomedImage: {
    width: Dimensions.get('window').width * 0.8,
    height: Dimensions.get('window').width * 0.8,
    borderRadius: (Dimensions.get('window').width * 0.8) / 2,
    overflow: 'hidden',
  },
})
