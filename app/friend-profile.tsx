import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getUserAchievements } from '@/lib/achievements'
import { supabase } from '@/lib/supabase'
import { ACHIEVEMENT_CATEGORIES, type UserAchievementWithDetails } from '@/types/achievement'
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
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [monthWorkoutDates, setMonthWorkoutDates] = useState<Set<string>>(new Set())
  const [isImageModalVisible, setIsImageModalVisible] = useState(false)
  const [achievements, setAchievements] = useState<UserAchievementWithDetails[]>([])
  const [selectedAchievement, setSelectedAchievement] = useState<UserAchievementWithDetails | null>(null)

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
      .select('workout_date')
      .eq('user_id', id)
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
  }, [id])

  const displayName = profile?.display_name || 'Athlete'
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
          <Pressable onPress={handleOpenModal} disabled={!showAvatarImage}>
            <View style={[styles.avatarWrap, { backgroundColor: colors.tint + '25' }]}>
              {showAvatarImage ? (
                <Image source={{ uri: profile.avatar_url! }} style={styles.avatarImage} />
              ) : (
                <ThemedText style={[styles.avatarInitials, { color: colors.tint }]}>{initials}</ThemedText>
              )}
            </View>
          </Pressable>
          <ThemedText type="title" style={[styles.displayName, { color: colors.text }]}>
            {displayName}
          </ThemedText>
          {profile.bio && (
            <ThemedText style={[styles.bio, { color: colors.textMuted }]}>{profile.bio}</ThemedText>
          )}
        </ThemedView>

        {/* Activity Calendar */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Activity
          </ThemedText>
          <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
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

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile.workouts_count ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>Workouts</ThemedText>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile.streak ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>Streak</ThemedText>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.card }]}>
            <ThemedText type="defaultSemiBold" style={[styles.statValue, { color: colors.tint }]}>
              {profile.groups_count ?? 0}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>Groups</ThemedText>
          </View>
        </View>

        {/* Achievements */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Achievements
          </ThemedText>
          {achievements.length === 0 ? (
            <View style={[styles.badgesContainer, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
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
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 88,
    height: 88,
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '600',
  },
  displayName: {
    marginBottom: 4,
    textAlign: 'center',
  },
  bio: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statBox: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 24,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  // Calendar styles
  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
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
  // Badges / Achievements
  badgesContainer: {
    borderRadius: 14,
    borderWidth: 1,
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
  progressBarOuter: { width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressBarInner: { height: '100%', borderRadius: 2 },
  unlockedBadge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 8 },
  unlockedText: { fontSize: 10, fontWeight: '700' },
  // Achievement detail modal
  achievementDetailCard: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', padding: 32 },
  achievementDetailInner: { width: '100%', borderRadius: 24, padding: 28, alignItems: 'center' },
  achievementDetailIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
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
