import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'

import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

import { FriendsPanel } from '@/components/friends-panel'
import SignOutButton from '@/components/social-auth-buttons/sign-out-button'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { getSpecialBadge } from '@/constants/special-badges'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getPendingReceived } from '@/lib/friends'
import { getUserLevel } from '@/lib/levels'
import { supabase } from '@/lib/supabase'
import type { ProfilePublic } from '@/types/friendship'
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
  { label: 'Settings', icon: 'settings-outline' as const, route: '/settings' },
]

export default function ProfileScreen() {
  const { session, profile } = useAuthContext()
  const params = useLocalSearchParams<{ friends?: string }>()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'

  const [profileMainTab, setProfileMainTab] = useState<'me' | 'friends'>('me')

  const avatarUrl = getAvatarUrl(profile, session)
  const [avatarLoadError, setAvatarLoadError] = useState(false)
  const [isImageModalVisible, setIsImageModalVisible] = useState(false)
  const showAvatarImage = avatarUrl && !avatarLoadError

  const [monthWorkoutDates, setMonthWorkoutDates] = useState<Set<string>>(new Set())

  const [userLevel, setUserLevel] = useState<UserLevel | null>(null)
  const [pendingIncoming, setPendingIncoming] = useState<
    { friendship: { id: string }; requester: ProfilePublic }[]
  >([])

  const loadUserLevel = useCallback(async () => {
    if (!session) return
    try {
      const level = await getUserLevel(session.user.id)
      setUserLevel(level)
    } catch {
      // ignore
    }
  }, [session])

  const loadPendingIncoming = useCallback(async () => {
    if (!session) return
    try {
      const p = await getPendingReceived(session.user.id)
      setPendingIncoming(p)
    } catch {
      // ignore
    }
  }, [session])

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
      const r = row as { workout_date?: string | null }
      if (typeof r.workout_date === 'string' && r.workout_date.length >= 10) {
        dates.add(r.workout_date.slice(0, 10))
      }
    }
    setMonthWorkoutDates(dates)
  }, [session, calendarYear, calendarMonth, daysInMonth])

  useEffect(() => {
    void fetchMonthWorkouts()
  }, [fetchMonthWorkouts])

  useFocusEffect(
    useCallback(() => {
      void fetchMonthWorkouts()
      void loadUserLevel()
      void loadPendingIncoming()
    }, [fetchMonthWorkouts, loadUserLevel, loadPendingIncoming])
  )

  useEffect(() => {
    setAvatarLoadError(false)
  }, [avatarUrl])

  useEffect(() => {
    if (params.friends !== '1' && params.friends !== 'true') return
    setProfileMainTab('friends')
    router.setParams({ friends: undefined })
  }, [params.friends])

  const displayName =
    (profile?.display_name && profile.display_name.trim()) ||
    (session ? getDisplayName(session) : '—')
  const specialBadge = getSpecialBadge(profile?.display_name)
  const initials = getInitials(displayName, session)

  const stats = [
    { value: profile?.workouts_count ?? 0, label: 'Workouts', color: colors.tint },
    { value: profile?.longest_streak ?? 0, label: 'Best streak', color: colors.warm },
    { value: profile?.streak ?? 0, label: 'Streak', color: colors.warm },
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
      <View style={styles.profileTopIconRow}>
        {profileMainTab === 'friends' ? (
          <Pressable
            onPress={() => setProfileMainTab('me')}
            hitSlop={12}
            style={[styles.profileTopIconBtn, { backgroundColor: colors.textMuted + '18' }]}
            accessibilityLabel="Back to profile"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.profileTopIconBtnPlaceholder} />
        )}
        <View style={{ flex: 1 }} />
        {profileMainTab === 'me' ? (
          <Pressable
            onPress={() => setProfileMainTab('friends')}
            hitSlop={12}
            style={[styles.profileTopIconBtn, { backgroundColor: colors.textMuted + '18' }]}
            accessibilityLabel="Friends"
          >
            <Ionicons name="people" size={20} color={colors.text} />
            {pendingIncoming.length > 0 ? (
              <View style={styles.profileFriendsNotifBadge}>
                <ThemedText style={styles.profileFriendsNotifBadgeText}>
                  {pendingIncoming.length > 9 ? '9+' : pendingIncoming.length}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <View style={styles.profileTopIconBtnPlaceholder} />
        )}
      </View>

      {profileMainTab === 'me' ? (
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
                  borderColor: colors.tint + '30',
                  shadowColor: userLevel?.level.color ?? colors.tint,
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 2,
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
          {specialBadge && (
            <View style={[styles.specialBadge, { backgroundColor: specialBadge.bgColor }]}>
              <ThemedText style={styles.specialBadgeEmoji}>{specialBadge.emoji}</ThemedText>
              <ThemedText style={[styles.specialBadgeLabel, { color: specialBadge.color }]}>
                {specialBadge.label}
              </ThemedText>
            </View>
          )}
          {profile?.bio ? (
            <ThemedText style={[styles.bio, { color: colors.textMuted }]}>{profile.bio}</ThemedText>
          ) : null}

          {/* Points progress bar */}
          {userLevel && (
            <View style={styles.xpSection}>
              <View style={styles.xpLabelRow}>
                <ThemedText style={[styles.xpLabel, { color: colors.textMuted }]}>
                  {userLevel.xp} pts
                </ThemedText>
                {userLevel.nextLevel ? (
                  <ThemedText style={[styles.xpLabel, { color: colors.textMuted }]}>
                    {userLevel.xpToNext} pts to {userLevel.nextLevel.emoji} {userLevel.nextLevel.title}
                  </ThemedText>
                ) : (
                  <ThemedText style={[styles.xpLabel, { color: userLevel.level.color }]}>
                    Max level reached!
                  </ThemedText>
                )}
              </View>
              <View style={[styles.xpBarOuter, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
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

        {pendingIncoming.length > 0 && (
          <Pressable
            onPress={() => setProfileMainTab('friends')}
            style={[
              styles.pendingFollowRow,
              { backgroundColor: colors.card, borderColor: colors.tabBarBorder },
            ]}
          >
            <ThemedText style={[styles.pendingFollowText, { color: colors.text }]}>
              {pendingIncoming.length}{' '}
              {pendingIncoming.length === 1 ? 'person wants' : 'people want'} to follow you
            </ThemedText>
            <View style={[styles.pendingFollowViewBtn, { backgroundColor: colors.tint }]}>
              <ThemedText style={styles.pendingFollowViewBtnText}>View</ThemedText>
            </View>
          </Pressable>
        )}

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Activity
          </ThemedText>
          <View style={[styles.calendarCard, { backgroundColor: colors.card }]}>
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

                // Check if there are any workouts before this day (indicating a streak was started)
                const hasAnyPreviousWorkout = Array.from(monthWorkoutDates).some((date) => date < iso)

                let statusStyle = styles.calendarDayNeutral
                let isColored = false

                if (hasWorkout) {
                  statusStyle = styles.calendarDayCompleted
                  isColored = true
                } else if (isOnOrAfterSignup && isPast && hasAnyPreviousWorkout) {
                  // Red: missed a previous day (had a streak going but didn't post)
                  statusStyle = styles.calendarDayMissed
                  isColored = true
                }
                // White: haven't posted yet (no streak, no post) - default neutral style

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
              <ThemedText
                style={[styles.statLabel, { color: colors.textMuted }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {s.label}
              </ThemedText>
            </View>
          ))}
        </View>

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
      ) : (
        <View style={styles.friendsPanelWrap}>
          <FriendsPanel onFriendsChanged={loadPendingIncoming} />
        </View>
      )}

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

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileTopIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    minHeight: 44,
  },
  profileTopIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  profileTopIconBtnPlaceholder: { width: 40, height: 40 },
  profileFriendsNotifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileFriendsNotifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  friendsPanelWrap: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 28 },
  avatarRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 100, height: 100 },
  avatarInitials: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
    textAlign: 'center',
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
  displayName: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 4, letterSpacing: -0.3 },
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
  xpSection: { width: '100%', marginTop: 14, paddingHorizontal: 20 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  xpLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  xpBarOuter: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden' },
  xpBarInner: { height: '100%', borderRadius: 3 },

  pendingFollowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  pendingFollowText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  pendingFollowViewBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  pendingFollowViewBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  statBox: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { marginTop: 2, fontSize: 9, fontWeight: '600', letterSpacing: 0, opacity: 0.6, textAlign: 'center' },

  section: { marginBottom: 28 },
  sectionTitle: { marginBottom: 14 },

  menuCard: { borderRadius: 14, overflow: 'hidden', marginBottom: 28 },
  menuItemWrap: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuItem: { fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth },

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
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calendarWeekday: {
    fontSize: 10,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
    letterSpacing: 0.3,
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
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
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
