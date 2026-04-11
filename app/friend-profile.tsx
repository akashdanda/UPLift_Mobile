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
import { getUserLevel } from '@/lib/levels'
import { supabase } from '@/lib/supabase'
import { acceptFriendRequestByUserId, getFriendshipStatus, sendFriendRequest } from '@/lib/friends'
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
  const [isImageModalVisible, setIsImageModalVisible] = useState(false)
  const [friendLevel, setFriendLevel] = useState<UserLevel | null>(null)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends'>('none')
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [nudgeLoading, setNudgeLoading] = useState(false)
  const isFriend = friendStatus === 'friends'

  const today = useMemo(() => new Date(), [])
  const todayDateString = useMemo(() => {
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [today])

  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const calendarYear = calendarDate.getFullYear()
  const calendarMonth = calendarDate.getMonth()
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay()
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

  const canGoForwardMonth = useMemo(() => {
    const n = new Date()
    return calendarYear < n.getFullYear() || (calendarYear === n.getFullYear() && calendarMonth < n.getMonth())
  }, [calendarYear, calendarMonth])

  const signupDateString = useMemo(() => {
    if (!profile?.created_at) return null
    return profile.created_at.slice(0, 10)
  }, [profile?.created_at])

  const canGoBackMonth = useMemo(() => {
    if (!signupDateString) return true
    const signY = Number(signupDateString.slice(0, 4))
    const signM = Number(signupDateString.slice(5, 7)) - 1
    return calendarYear > signY || (calendarYear === signY && calendarMonth > signM)
  }, [signupDateString, calendarYear, calendarMonth])

  // Fetch friend's workouts for the calendar month being viewed
  const fetchMonthWorkouts = useCallback(async () => {
    if (!id) return
    const y = calendarYear
    const m = String(calendarMonth + 1).padStart(2, '0')
    const start = `${y}-${m}-01`
    const end = `${y}-${m}-${String(daysInMonth).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('workouts')
      .select('workout_date, workout_type')
      .eq('user_id', id)
      .gte('workout_date', start)
      .lte('workout_date', end)

    if (error) return

    const dateMap = new Map<string, string | null>()
    for (const row of data ?? []) {
      const r = row as { workout_date?: string | null; workout_type?: string | null }
      if (typeof r.workout_date !== 'string' || r.workout_date.length < 10) continue
      const iso = r.workout_date.slice(0, 10)
      const wt = r.workout_type ?? null
      const existing = dateMap.get(iso)
      if (existing === undefined) {
        dateMap.set(iso, wt)
      } else if (wt !== 'rest') {
        dateMap.set(iso, wt)
      }
    }
    const dates = new Set<string>()
    const restDates = new Set<string>()
    for (const [iso, wt] of dateMap) {
      dates.add(iso)
      if (wt === 'rest') restDates.add(iso)
    }
    setMonthWorkoutDates(dates)
    setMonthRestDates(restDates)
  }, [id, calendarYear, calendarMonth, daysInMonth])

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

  // Fetch workouts for calendar once profile is loaded
  useEffect(() => {
    void fetchMonthWorkouts()
  }, [fetchMonthWorkouts])

  useEffect(() => {
    if (!id) return
    getUserLevel(id).then(setFriendLevel).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!session || !id) return
    getFriendshipStatus(session.user.id, id as string)
      .then(setFriendStatus)
      .catch(() => setFriendStatus('none'))
  }, [session, id])

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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.floatingBack, { top: 8 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.floatingBack, { top: 8 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <View style={styles.centered}>
          <ThemedText style={{ color: colors.textMuted }}>Profile not found.</ThemedText>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: Avatar, Name, Bio */}
        <ThemedView style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.headerBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
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

        {/* Activity Calendar */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Activity
          </ThemedText>
          <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') }]}>
            <View style={styles.calendarHeaderRow}>
              <Pressable
                onPress={() => canGoBackMonth && handleChangeMonth(-1)}
                hitSlop={10}
                disabled={!canGoBackMonth}
                style={({ pressed }) => [{ opacity: !canGoBackMonth ? 0.25 : pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
              </Pressable>
              <ThemedText style={[styles.calendarMonthLabel, { color: colors.text }]}>{monthLabel}</ThemedText>
              <Pressable
                onPress={() => canGoForwardMonth && handleChangeMonth(1)}
                hitSlop={10}
                disabled={!canGoForwardMonth}
                style={({ pressed }) => [{ opacity: !canGoForwardMonth ? 0.25 : pressed ? 0.6 : 1 }]}
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
                const isPast = iso < todayDateString
                const hasWorkout = monthWorkoutDates.has(iso)
                const isOnOrAfterSignup = !signupDateString || iso >= signupDateString

                const hasAnyPreviousWorkout = Array.from(monthWorkoutDates).some((date) => date < iso)

                let statusStyle = styles.calendarDayNeutral

                if (hasWorkout) {
                  if (monthRestDates.has(iso)) {
                    statusStyle = styles.calendarDayRest
                  } else {
                    statusStyle = styles.calendarDayCompleted
                  }
                } else if (isOnOrAfterSignup && isPast && hasAnyPreviousWorkout) {
                  statusStyle = styles.calendarDayMissed
                }

                return (
                  <View key={iso} style={styles.calendarDayCell}>
                    <View style={[styles.calendarDayCircle, statusStyle]}>
                      <ThemedText style={[styles.calendarDayText, { color: isDark ? '#fff' : colors.text }]}>
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
              <View style={styles.calendarLegendItem}>
                <View style={[styles.calendarLegendDot, styles.calendarDayRest]} />
                <ThemedText style={[styles.calendarLegendLabel, { color: colors.textMuted }]}>
                  Rest day
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
        </View>

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
    paddingTop: 4,
  },
  headerBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    padding: 4,
    zIndex: 2,
  },
  floatingBack: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    padding: 4,
  },
  reportFlag: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 4,
    zIndex: 2,
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
  // Calendar styles
  calendarCard: {
    borderRadius: 14,
    padding: 16,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarMonthLabel: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    flex: 1,
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
    backgroundColor: '#6366f1',
  },
  calendarDayMissed: {
    backgroundColor: '#ef4444',
  },
  calendarDayNeutral: {
    backgroundColor: 'transparent',
  },
  calendarLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
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
