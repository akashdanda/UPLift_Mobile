import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CelebrationModal } from '@/components/celebration-modal'
import SignOutButton from '@/components/social-auth-buttons/sign-out-button'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  checkAndUpdateAchievements,
  createAchievementFeedPost,
  getUserAchievements,
  markAchievementNotified,
} from '@/lib/achievements'
import { getHighlightsForProfile } from '@/lib/highlights'
import { computeXP, getLevelFromXP } from '@/lib/levels'
import { supabase } from '@/lib/supabase'
import { ACHIEVEMENT_CATEGORIES, type UserAchievementWithDetails } from '@/types/achievement'
import type { HighlightForProfile } from '@/types/highlight'
import type { UserLevel } from '@/types/level'

function getDisplayName(session: { user: { user_metadata?: { full_name?: string }; email?: string } }): string {
  const name = session.user.user_metadata?.full_name
  if (name && typeof name === 'string') return name
  const email = session.user.email
  if (email) return email.split('@')[0] ?? email
  return 'Athlete'
}

function getAvatarUrl(
  profile: { avatar_url?: string | null } | null,
  session: { user: { user_metadata?: { avatar_url?: string }; email?: string } } | null
): string | null {
  if (profile?.avatar_url) return profile.avatar_url
  if (session?.user?.user_metadata?.avatar_url) return session.user.user_metadata.avatar_url
  return null
}

function getInitials(
  displayName: string,
  session: { user: { user_metadata?: { full_name?: string }; email?: string } } | null
): string {
  if (displayName && displayName !== '—') {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase()
    if (parts[0]?.[0]) return parts[0][0].toUpperCase()
  }
  if (session?.user?.email) return session.user.email.slice(0, 2).toUpperCase()
  return '?'
}

const MENU_ITEMS = [
  { label: 'Edit profile', icon: 'person-outline' as const, route: '/edit-profile' },
  { label: 'Friends', icon: 'people-outline' as const, route: '/friends' },
  { label: 'Settings', icon: 'settings-outline' as const, route: '/settings' },
]

export default function ProfileScreen() {
  const { session, profile } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const avatarUrl = getAvatarUrl(profile, session)
  const [avatarLoadError, setAvatarLoadError] = useState(false)
  const [isImageModalVisible, setIsImageModalVisible] = useState(false)
  const showAvatarImage = avatarUrl && !avatarLoadError

  const [monthWorkoutDates, setMonthWorkoutDates] = useState<Set<string>>(new Set())

  // Highlights (Instagram-style)
  const [highlights, setHighlights] = useState<HighlightForProfile[]>([])

  // Achievements state
  const [achievements, setAchievements] = useState<UserAchievementWithDetails[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(true)
  const [selectedAchievement, setSelectedAchievement] = useState<UserAchievementWithDetails | null>(null)
  const [celebrationQueue, setCelebrationQueue] = useState<UserAchievementWithDetails[]>([])
  const [showCelebration, setShowCelebration] = useState(false)

  // Level state
  const [userLevel, setUserLevel] = useState<UserLevel | null>(null)

  // Load achievements + compute level
  const loadAchievements = useCallback(async () => {
    if (!session) return
    setAchievementsLoading(true)
    try {
      const data = await getUserAchievements(session.user.id)
      setAchievements(data)
      // Compute level from profile stats + unlocked achievement count
      if (profile) {
        const unlockedCount = data.filter((a) => a.unlocked).length
        const xp = computeXP(profile, unlockedCount)
        setUserLevel(getLevelFromXP(xp))
      }
    } catch {
      // ignore
    } finally {
      setAchievementsLoading(false)
    }
  }, [session, profile])

  // Check achievements and show celebrations for new unlocks
  const refreshAchievements = useCallback(async () => {
    if (!session) return
    try {
      const newlyUnlocked = await checkAndUpdateAchievements(session.user.id)
      if (newlyUnlocked.length > 0) {
        setCelebrationQueue(newlyUnlocked)
        setShowCelebration(true)
        // Create feed posts for new unlocks
        for (const ach of newlyUnlocked) {
          const displayName = profile?.display_name || 'Someone'
          await createAchievementFeedPost(
            session.user.id,
            ach.achievement_id,
            `${ach.icon} ${displayName} just unlocked "${ach.name}"!`
          )
          await markAchievementNotified(session.user.id, ach.achievement_id)
        }
      }
      await loadAchievements()
    } catch {
      // ignore
    }
  }, [session, profile, loadAchievements])

  useFocusEffect(
    useCallback(() => {
      void refreshAchievements()
    }, [refreshAchievements])
  )

  const handleDismissCelebration = useCallback(() => {
    setCelebrationQueue((prev) => {
      if (prev.length <= 1) {
        setShowCelebration(false)
        return []
      }
      return prev.slice(1)
    })
  }, [])

  const handleShareCelebration = useCallback(async () => {
    // The feed post was already created above; just dismiss
    handleDismissCelebration()
  }, [handleDismissCelebration])

  const currentCelebration = celebrationQueue[0] ?? null

  // Today (used for streak / \"missed day\" logic)
  const today = useMemo(() => new Date(), [])
  const todayDateString = useMemo(() => {
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [today])

  // Calendar month being viewed – defaults to current month but can be changed
  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const calendarYear = calendarDate.getFullYear()
  const calendarMonth = calendarDate.getMonth() // 0-11
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay() // 0-6 Sun-Sat
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
      }).format(calendarDate),
    [calendarDate]
  )

  const handleChangeMonth = (delta: number) => {
    setCalendarDate((prev) => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() + delta)
      next.setDate(1)
      return next
    })
  }

  const signupDateString = useMemo(() => {
    if (!profile?.created_at) return null
    return profile.created_at.slice(0, 10)
  }, [profile?.created_at])

  // Fetch workouts for current month for calendar
  const fetchMonthWorkouts = useCallback(async () => {
    if (!session) return
    const y = calendarYear
    const m = String(calendarMonth + 1).padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = `${y}-${m}-${String(daysInMonth).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('workouts')
      .select('workout_date')
      .eq('user_id', session.user.id)
      .gte('workout_date', start)
      .lte('workout_date', end)

    if (error) return

    const dates = new Set<string>()
    for (const row of data ?? []) {
      const value = (row as { workout_date?: string | null }).workout_date
      if (typeof value === 'string' && value.length >= 10) {
        dates.add(value.slice(0, 10))
      }
    }
    setMonthWorkoutDates(dates)
  }, [session, calendarYear, calendarMonth, daysInMonth])

  useEffect(() => {
    void fetchMonthWorkouts()
  }, [fetchMonthWorkouts])

  // Refresh calendar and highlights when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      void fetchMonthWorkouts()
      if (session) getHighlightsForProfile(session.user.id).then(setHighlights)
    }, [fetchMonthWorkouts, session])
  )

  useEffect(() => {
    setAvatarLoadError(false)
  }, [avatarUrl])

  const displayName =
    (profile?.display_name && profile.display_name.trim()) ||
    (session ? getDisplayName(session) : '—')
  const initials = getInitials(displayName, session)

  const stats = [
    { value: profile?.workouts_count ?? 0, label: 'Workouts', color: colors.tint },
    { value: profile?.streak ?? 0, label: 'Streak', color: colors.warm },
    { value: profile?.groups_count ?? 0, label: 'Groups', color: colors.tint },
    { value: profile?.friends_count ?? 0, label: 'Friends', color: colors.tint },
  ]

  // Zoom modal state (avatar pinch-to-zoom)
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

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.header}>
          <Pressable onPress={handleOpenModal} disabled={!showAvatarImage}>
            <View
              style={[
                styles.avatarRing,
                {
                  borderColor: userLevel?.level.color ?? colors.tint,
                  shadowColor: userLevel?.level.color ?? colors.tint,
                  shadowOpacity: 0.4,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 6,
                },
              ]}
            >
              <View style={[styles.avatarWrap, { backgroundColor: colors.tint + '25' }]}>
                {showAvatarImage ? (
                  <Image
                    source={{ uri: avatarUrl! }}
                    style={styles.avatarImage}
                    onError={() => setAvatarLoadError(true)}
                  />
                ) : (
                  <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>{initials}</ThemedText>
                )}
              </View>
            </View>
          </Pressable>

          {/* Level title */}
          {userLevel && (
            <View style={[styles.levelBadge, { backgroundColor: userLevel.level.glowColor }]}>
              <ThemedText style={styles.levelEmoji}>{userLevel.level.emoji}</ThemedText>
              <ThemedText style={[styles.levelTitle, { color: userLevel.level.color }]}>
                {userLevel.level.title}
              </ThemedText>
            </View>
          )}

          <ThemedText type="title" style={[styles.displayName, { color: colors.text }]}>
            {displayName}
          </ThemedText>
          {profile?.bio ? (
            <ThemedText style={[styles.bio, { color: colors.textMuted }]}>{profile.bio}</ThemedText>
          ) : null}

          {/* XP progress bar */}
          {userLevel && (
            <View style={styles.xpSection}>
              <View style={styles.xpLabelRow}>
                <ThemedText style={[styles.xpLabel, { color: colors.textMuted }]}>
                  {userLevel.xp} XP
                </ThemedText>
                {userLevel.nextLevel ? (
                  <ThemedText style={[styles.xpLabel, { color: colors.textMuted }]}>
                    {userLevel.xpToNext} XP to {userLevel.nextLevel.emoji} {userLevel.nextLevel.title}
                  </ThemedText>
                ) : (
                  <ThemedText style={[styles.xpLabel, { color: userLevel.level.color }]}>
                    Max level reached!
                  </ThemedText>
                )}
              </View>
              <View style={[styles.xpBarOuter, { backgroundColor: colors.cardElevated }]}>
                <View
                  style={[
                    styles.xpBarInner,
                    {
                      width: `${Math.round(userLevel.progress * 100)}%`,
                      backgroundColor: userLevel.level.color,
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </ThemedView>

        {/* Highlights (Instagram-style) */}
        <View style={styles.highlightsSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.highlightsScroll}
          >
            <Pressable
              onPress={() => router.push('/manage-highlights')}
              style={[styles.highlightCircleWrap, { borderColor: colors.tabBarBorder }]}
            >
              <View style={[styles.highlightCircle, { backgroundColor: colors.cardElevated }]}>
                <Ionicons name="add" size={28} color={colors.textMuted} />
              </View>
              <ThemedText style={[styles.highlightLabel, { color: colors.textMuted }]} numberOfLines={1}>
                New
              </ThemedText>
            </Pressable>
            {highlights.map((h) => (
              <Pressable
                key={h.id}
                onPress={() => router.push({ pathname: '/highlight-detail', params: { id: h.id } })}
                style={[styles.highlightCircleWrap, { borderColor: colors.tabBarBorder }]}
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

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Activity
          </ThemedText>
          <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            <View style={styles.calendarHeaderRow}>
              <Pressable
                onPress={() => handleChangeMonth(-1)}
                hitSlop={10}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
              </Pressable>
              <ThemedText style={[styles.calendarMonthLabel, { color: colors.text }]}>
                {monthLabel}
              </ThemedText>
              <Pressable
                onPress={() => handleChangeMonth(1)}
                hitSlop={10}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
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
                const iso = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(
                  2,
                  '0'
                )}`
                const isToday = iso === todayDateString
                const isPast = iso < todayDateString
                const hasWorkout = monthWorkoutDates.has(iso)
                const isOnOrAfterSignup = !signupDateString || iso >= signupDateString

                let statusStyle = styles.calendarDayNeutral
                let isColored = false

                if (hasWorkout) {
                  // Always show green if a workout was logged that day
                  statusStyle = styles.calendarDayCompleted
                  isColored = true
                } else if (isOnOrAfterSignup && (isToday || isPast)) {
                  // Only show red for missed days on/after signup
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
                <View style={[styles.calendarLegendDot, styles.calendarDayMissed]} />
                <ThemedText style={[styles.calendarLegendLabel, { color: colors.textMuted }]}>
                  Missed day
                </ThemedText>
              </View>
            </View>
          </View>
        </ThemedView>

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: colors.card }]}>
              <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</ThemedText>
            </View>
          ))}
        </View>

        {/* Achievements Section */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Achievements
          </ThemedText>
          {achievementsLoading ? (
            <View style={styles.achievementsLoading}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : achievements.length === 0 ? (
            <View style={[styles.badgesContainer, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
              <ThemedText style={[styles.emptyBadgesText, { color: colors.textMuted }]}>
                Keep working out to earn your first achievement!
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
                          : colors.tabBarBorder,
                        borderWidth: ach.unlocked ? 1.5 : 1,
                        shadowColor: ach.unlocked ? catMeta?.color ?? colors.tint : 'transparent',
                        shadowOpacity: ach.unlocked ? 0.3 : 0,
                        shadowRadius: ach.unlocked ? 8 : 0,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: ach.unlocked ? 4 : 0,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.achievementIconWrap,
                        {
                          backgroundColor: ach.unlocked
                            ? (catMeta?.color ?? colors.tint) + '20'
                            : colors.cardElevated,
                          opacity: ach.unlocked ? 1 : 0.5,
                        },
                      ]}
                    >
                      <ThemedText style={styles.achievementIcon}>{ach.icon}</ThemedText>
                    </View>
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

        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          {MENU_ITEMS.map((item, i) => (
            <Pressable
              key={item.label}
              style={[
                styles.menuItemWrap,
                i < MENU_ITEMS.length - 1 && [styles.menuItemBorder, { borderBottomColor: colors.tabBarBorder }],
              ]}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons name={item.icon} size={20} color={colors.textMuted} style={{ marginRight: 14 }} />
              <ThemedText style={[styles.menuItem, { color: colors.text }]}>{item.label}</ThemedText>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
            </Pressable>
          ))}
        </View>

        <SignOutButton />
      </ScrollView>

      {/* Avatar zoom modal */}
      <Modal
        visible={isImageModalVisible}
        transparent
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
                      source={{ uri: avatarUrl! }}
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
                      <ThemedText style={styles.achievementDetailIcon}>
                        {selectedAchievement.icon}
                      </ThemedText>
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
                      style={[styles.achievementDetailClose, { borderColor: colors.tabBarBorder }]}
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

      {/* Celebration modal */}
      {currentCelebration && (
        <CelebrationModal
          visible={showCelebration}
          icon={currentCelebration.icon}
          title={currentCelebration.name}
          description={currentCelebration.description}
          onDismiss={handleDismissCelebration}
          onShare={handleShareCelebration}
          accentColor={
            ACHIEVEMENT_CATEGORIES[currentCelebration.category as keyof typeof ACHIEVEMENT_CATEGORIES]?.color
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24 },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarWrap: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 94, height: 94 },
  avatarInitials: { fontSize: 34, fontWeight: '700' },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 6,
  },
  levelEmoji: { fontSize: 14 },
  levelTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  displayName: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  bio: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  xpSection: { width: '100%', marginTop: 10, paddingHorizontal: 20 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  xpLabel: { fontSize: 11, fontWeight: '600' },
  xpBarOuter: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  xpBarInner: { height: '100%', borderRadius: 3 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statBox: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { marginTop: 2, fontSize: 11, opacity: 0.7 },

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
  highlightLabel: { fontSize: 12, marginTop: 6, maxWidth: 72, textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionTitle: { marginBottom: 12 },
  badgesContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBadgesText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Achievements
  achievementsLoading: { paddingVertical: 24, alignItems: 'center' },
  achievementsScroll: { paddingRight: 24, gap: 12 },
  achievementCard: {
    width: 130,
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  achievementIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  achievementIcon: { fontSize: 26 },
  achievementName: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 8, lineHeight: 16 },
  progressBarOuter: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    borderRadius: 2,
  },
  unlockedBadge: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  unlockedText: { fontSize: 10, fontWeight: '700' },

  // Achievement detail modal
  achievementDetailCard: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  achievementDetailInner: {
    width: '100%',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  achievementDetailIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  achievementDetailIcon: { fontSize: 38 },
  achievementDetailCategory: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  achievementDetailName: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  achievementDetailDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  achievementDetailProgressSection: { width: '100%', marginBottom: 20 },
  achievementDetailProgressOuter: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  achievementDetailProgressInner: { height: '100%', borderRadius: 4 },
  achievementDetailProgressText: { fontSize: 13, textAlign: 'center', fontWeight: '600' },
  achievementDetailUnlocked: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 12, marginBottom: 20 },
  achievementDetailUnlockedText: { fontSize: 14, fontWeight: '700' },
  achievementDetailClose: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1 },
  achievementDetailCloseText: { fontSize: 15, fontWeight: '600' },

  menuCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  menuItemWrap: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuItem: { fontSize: 16 },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth },

  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
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
  zoomedImageContainer: { justifyContent: 'center', alignItems: 'center' },
  zoomedImage: {
    width: Dimensions.get('window').width * 0.8,
    height: Dimensions.get('window').width * 0.8,
    borderRadius: (Dimensions.get('window').width * 0.8) / 2,
    overflow: 'hidden',
  },
})
