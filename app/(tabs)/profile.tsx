import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
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

import SignOutButton from '@/components/social-auth-buttons/sign-out-button'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { supabase } from '@/lib/supabase'

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

  const today = useMemo(() => new Date(), [])
  const todayDateString = useMemo(() => {
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [today])
  const signupDateString = useMemo(() => {
    if (!profile?.created_at) return null
    return profile.created_at.slice(0, 10)
  }, [profile?.created_at])
  const year = today.getFullYear()
  const month = today.getMonth() // 0-11
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0-6 Sun-Sat
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
      }).format(today),
    [today]
  )

  // Fetch workouts for current month for calendar
  const fetchMonthWorkouts = useCallback(async () => {
    if (!session) return
    const y = year
    const m = String(month + 1).padStart(2, '0')
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
  }, [session, year, month, daysInMonth])

  useEffect(() => {
    void fetchMonthWorkouts()
  }, [fetchMonthWorkouts])

  // Refresh calendar when screen comes into focus (e.g., after posting a workout)
  useFocusEffect(
    useCallback(() => {
      void fetchMonthWorkouts()
    }, [fetchMonthWorkouts])
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
          </Pressable>
          <ThemedText type="title" style={[styles.displayName, { color: colors.text }]}>
            {displayName}
          </ThemedText>
          {profile?.bio ? (
            <ThemedText style={[styles.bio, { color: colors.textMuted }]}>{profile.bio}</ThemedText>
          ) : null}
        </ThemedView>

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

        <View style={styles.statsRow}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: colors.card }]}>
              <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</ThemedText>
            </View>
          ))}
        </View>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, { color: colors.text }]}>
            Badges
          </ThemedText>
          <View style={[styles.badgesContainer, { backgroundColor: colors.card, borderColor: colors.tabBarBorder }]}>
            <ThemedText style={[styles.emptyBadgesText, { color: colors.textMuted }]}>
              No badges yet. Keep working out to earn your first badge!
            </ThemedText>
          </View>
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
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24 },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  avatarImage: { width: 96, height: 96 },
  avatarInitials: { fontSize: 34, fontWeight: '700' },
  displayName: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  bio: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
    lineHeight: 20,
  },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statBox: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { marginTop: 2, fontSize: 11, opacity: 0.7 },

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

  menuCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  menuItemWrap: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  menuItem: { fontSize: 16 },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth },

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
