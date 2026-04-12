import Ionicons from '@expo/vector-icons/Ionicons'
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_900Black, useFonts } from '@expo-google-fonts/outfit'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { CameraCapture } from '@/components/camera-capture'
import { CelebrationModal } from '@/components/celebration-modal'
import { ThemedText } from '@/components/themed-text'
import { Colors, Fonts } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { formatGymLabel } from '@/lib/feed'
import { getRememberedGymLabel, rememberGymLabel } from '@/lib/gym-label-cache'
import { getFriends, type FriendWithProfile } from '@/lib/friends'
import { computeXP, getLevelFromXP } from '@/lib/levels'
import { pushFirstFriendWorkout } from '@/lib/push-notifications'
import { isCheckedInAtGym } from '@/lib/presence-service'
import { supabase } from '@/lib/supabase'
import { invalidateTodayWorkoutPosted } from '@/lib/today-workout-tab'
import { addWorkoutTags } from '@/lib/tags'
import { uploadWorkoutImage } from '@/lib/workout-upload'
import type { UserLevel } from '@/types/level'
import type { Workout, WorkoutVisibility } from '@/types/workout'

/** Stored for analytics / feed; no longer user-selectable in this screen. */
const DEFAULT_WORKOUT_TYPE = 'strength' as const

function formatFeedDate(workoutDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workoutDate)
  if (!match) return ''
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const d = new Date(year, monthIndex, day)
  if (Number.isNaN(d.getTime())) return ''

  const today = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatFeedPostTimestamp(iso: string | null | undefined): string {
  if (!iso) return ''
  const posted = new Date(iso)
  if (Number.isNaN(posted.getTime())) return ''
  const now = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const timeStr = posted.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay(posted, now)) return `Today · ${timeStr}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(posted, yesterday)) return `Yesterday · ${timeStr}`
  const yNow = now.getFullYear()
  const datePart =
    posted.getFullYear() === yNow
      ? posted.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : posted.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${datePart} · ${timeStr}`
}

function FeedStylePostCard({
  primaryUri,
  secondaryUri,
  displayName,
  avatarUrl,
  caption,
  gymLabel,
  dateLabel,
  taggedNames,
}: {
  primaryUri: string
  secondaryUri?: string | null
  displayName: string
  avatarUrl?: string | null
  caption?: string | null
  gymLabel?: string | null
  dateLabel: string
  taggedNames?: string[]
}) {
  const colorScheme = useColorScheme()
  const themeColors = Colors[colorScheme ?? 'light']
  const isDark = colorScheme === 'dark'
  const [frontImage, setFrontImage] = useState<'primary' | 'secondary'>('primary')
  const hasDual = !!(secondaryUri && secondaryUri.trim().length > 0)
  const mainUri = hasDual ? (frontImage === 'primary' ? primaryUri : secondaryUri!) : primaryUri
  const overlayUri = hasDual ? (frontImage === 'primary' ? secondaryUri! : primaryUri) : primaryUri

  const toggle = () => {
    if (!hasDual) return
    setFrontImage((f) => (f === 'primary' ? 'secondary' : 'primary'))
  }

  return (
    <View
      style={[
        styles.lbPreviewCard,
        {
          borderColor: themeColors.tint + '30',
          backgroundColor: isDark ? themeColors.tint + '12' : themeColors.card,
        },
      ]}
    >
      <View style={styles.feedStyleImageContainer}>
        <View style={[styles.feedStyleImageFrame, { backgroundColor: themeColors.background }]}>
          <View style={styles.feedStyleImagePressable}>
            <Image source={{ uri: mainUri }} style={styles.feedStyleMainImage} contentFit="cover" />
          </View>
          {hasDual ? (
            <Pressable style={styles.feedStyleCornerInset} onPressIn={toggle}>
              <Image source={{ uri: overlayUri }} style={styles.feedStyleCornerImage} contentFit="cover" />
            </Pressable>
          ) : null}
        </View>
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.feedStyleGradient}>
          <View style={styles.feedStyleOverlayRow}>
            <View style={styles.feedStyleAvatar}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.feedStyleAvatarImg} />
              ) : (
                <Text style={styles.feedStyleAvatarInitials}>{getInitials(displayName)}</Text>
              )}
            </View>
            <View style={styles.feedStyleOverlayTextCol}>
              <Text style={styles.feedStyleName} numberOfLines={1}>
                {displayName}
              </Text>
              {caption ? (
                <Text style={styles.feedStyleCaption} numberOfLines={2}>
                  {caption}
                </Text>
              ) : null}
              {gymLabel ? (
                <View style={styles.feedStyleLocationRow}>
                  <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.78)" />
                  <Text style={styles.feedStyleLocation} numberOfLines={2}>
                    {gymLabel}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.feedStyleMeta}>{dateLabel}</Text>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.feedStyleActionCol} pointerEvents="none">
          <Ionicons name="chatbubble" size={24} color="rgba(255,255,255,0.9)" style={{ opacity: 0.4 }} />
          <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.6)" style={{ opacity: 0.4 }} />
        </View>
      </View>
      {taggedNames && taggedNames.length > 0 ? (
        <View style={[styles.feedStyleTaggedFooter, { borderTopColor: themeColors.tint + '28' }]}>
          <View
            style={[
              styles.feedStyleTaggedPill,
              {
                borderColor: themeColors.tint + '32',
                backgroundColor: themeColors.tint + '18',
              },
            ]}
          >
            <View style={[styles.feedStyleTaggedIconBubble, { backgroundColor: themeColors.tint + '22' }]}>
              <Ionicons name="people" size={14} color={themeColors.tint} />
            </View>
            <View style={styles.feedStyleTaggedTextWrap}>
              <Text
                style={[
                  styles.feedStyleTaggedKicker,
                  { color: isDark ? 'rgba(255,255,255,0.5)' : themeColors.textMuted },
                ]}
              >
                With
              </Text>
              <Text
                style={[
                  styles.feedStyleTaggedNames,
                  { color: isDark ? 'rgba(255,255,255,0.94)' : themeColors.text },
                ]}
                numberOfLines={2}
              >
                {taggedNames.join(' · ')}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.feedStyleFooterBar} />
      )}
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

/** PostgREST when `workouts.gym_id` has not been migrated yet. */
function isMissingWorkoutsGymIdColumn(err: { message?: string }): boolean {
  const m = (err.message ?? '').toLowerCase()
  return m.includes('gym_id') && (m.includes('schema cache') || m.includes('could not find'))
}

function LogWorkoutBackRow({
  colors,
  isDark,
}: {
  colors: (typeof Colors)[keyof typeof Colors]
  isDark: boolean
}) {
  return (
    <View
      style={[
        styles.logBackRow,
        { borderBottomColor: colors.tabBarBorder },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        style={[
          styles.logBackButton,
          { backgroundColor: colors.textMuted + '18' },
        ]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
    </View>
  )
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
  const { height: windowHeight } = useWindowDimensions()
  const [fontsLoaded] = useFonts({
    Outfit_900Black,
    Outfit_700Bold,
    Outfit_600SemiBold,
  })

  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkInAllowed, setCheckInAllowed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [caption, setCaption] = useState('')
  // Dual capture: pendingSecondaryUri = front (selfie), pendingPhotoUri = back (workout).
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null)
  const [pendingSecondaryUri, setPendingSecondaryUri] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  /** Which lens is active in the open camera modal. */
  const [cameraPhase, setCameraPhase] = useState<'selfie' | 'workout'>('selfie')
  /** Same as `cameraPhase` but updated synchronously so `onCapture` never reads a stale phase. */
  const cameraPhaseRef = useRef<'selfie' | 'workout'>('selfie')
  /** Only auto-open once per visit when eligible; retake opens camera explicitly. */
  const hasAutoLaunchedCamera = useRef(false)

  useEffect(() => {
    cameraPhaseRef.current = cameraPhase
  }, [cameraPhase])
  // Level-up celebration
  const [levelUpCelebration, setLevelUpCelebration] = useState<UserLevel | null>(null)
  const [showLevelUp, setShowLevelUp] = useState(false)

  const [visibility, setVisibility] = useState<WorkoutVisibility>('friends')

  const [friends, setFriends] = useState<FriendWithProfile[]>([])
  const [taggedFriends, setTaggedFriends] = useState<Set<string>>(() => new Set())
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [tagSearchQuery, setTagSearchQuery] = useState('')

  useEffect(() => {
    if (!showTagPicker) setTagSearchQuery('')
  }, [showTagPicker])

  const filteredFriendsForTag = useMemo(() => {
    const q = tagSearchQuery.trim().toLowerCase()
    if (!q) return friends
    return friends.filter((f) => (f.display_name || '').toLowerCase().includes(q))
  }, [friends, tagSearchQuery])

  const taggedPreviewNames = useMemo(
    () => friends.filter((f) => taggedFriends.has(f.id)).map((f) => f.display_name || 'Friend'),
    [friends, taggedFriends],
  )

  const activeGymId = gymId ?? todayWorkout?.gym_id ?? null
  const [resolvedGymLine, setResolvedGymLine] = useState<string | null>(null)

  const today = getTodayLocalDate()

  useEffect(() => {
    if (!activeGymId) {
      setResolvedGymLine(null)
      return
    }
    const mem = getRememberedGymLabel(activeGymId)
    if (mem) {
      setResolvedGymLine(mem)
      return
    }
    if (gymName?.trim() && gymId && gymId === activeGymId) {
      const line = gymName.trim()
      rememberGymLabel(activeGymId, line)
      setResolvedGymLine(line)
      return
    }
    let cancelled = false
    void supabase
      .from('gyms')
      .select('name,address')
      .eq('id', activeGymId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data) {
          const line = formatGymLabel(data.name, data.address)
          if (line) {
            rememberGymLabel(activeGymId, line)
            setResolvedGymLine(line)
          } else {
            setResolvedGymLine(null)
          }
        } else {
          setResolvedGymLine(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeGymId, gymId, gymName, todayWorkout?.gym_id])

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

  // Open camera immediately when you land on the log screen (checked in, no post yet).
  useEffect(() => {
    if (loading || todayWorkout || !checkInAllowed) return
    if (pendingPhotoUri || pendingSecondaryUri) return
    if (cameraOpen) return
    if (hasAutoLaunchedCamera.current) return
    hasAutoLaunchedCamera.current = true
    cameraPhaseRef.current = 'selfie'
    setCameraPhase('selfie')
    setCameraOpen(true)
  }, [loading, todayWorkout, checkInAllowed, pendingPhotoUri, pendingSecondaryUri, cameraOpen])

  const handleTakePhoto = () => {
    if (!session) return
    if (pendingSecondaryUri && !pendingPhotoUri) {
      cameraPhaseRef.current = 'workout'
      setCameraPhase('workout')
    } else {
      cameraPhaseRef.current = 'selfie'
      setCameraPhase('selfie')
      setPendingSecondaryUri(null)
      setPendingPhotoUri(null)
    }
    setCameraOpen(true)
  }

  const handleCapture = (uri: string) => {
    if (cameraPhaseRef.current === 'selfie') {
      setPendingSecondaryUri(uri)
      cameraPhaseRef.current = 'workout'
      setCameraPhase('workout')
    } else {
      setPendingPhotoUri(uri)
      setCameraOpen(false)
    }
  }

  const handlePost = async () => {
    if (!session || !pendingPhotoUri || !pendingSecondaryUri || !gymId) return
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

    const rowWithGym = {
      user_id: session.user.id,
      gym_id: gymId,
      workout_date: today,
      image_url: uploadResult.url,
      secondary_image_url: secondaryUrl,
      workout_type: DEFAULT_WORKOUT_TYPE,
      caption: caption.trim() || null,
      visibility,
    }
    const rowLegacy = {
      user_id: session.user.id,
      workout_date: today,
      image_url: uploadResult.url,
      secondary_image_url: secondaryUrl,
      workout_type: DEFAULT_WORKOUT_TYPE,
      caption: caption.trim() || null,
      visibility,
    }

    const first = await supabase.from('workouts').insert(rowWithGym).select().single()
    let workoutRow = first.data
    let error = first.error
    if (error && isMissingWorkoutsGymIdColumn(error)) {
      const second = await supabase.from('workouts').insert(rowLegacy).select().single()
      workoutRow = second.data
      error = second.error
    }

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

    if (gymId) {
      let lbl = gymName?.trim() || null
      if (!lbl) {
        const { data: g } = await supabase.from('gyms').select('name,address').eq('id', gymId).maybeSingle()
        if (g) lbl = formatGymLabel(g.name, g.address)
      }
      if (lbl) rememberGymLabel(gymId, lbl)
    }

    if (taggedFriends.size > 0 && workoutRow) {
      await addWorkoutTags(workoutRow.id, [...taggedFriends]).catch(() => {})
    }

    // Compute level BEFORE refreshing profile (to detect level-up)
    const oldXP = profile
      ? computeXP(profile, 0)
      : 0
    const oldLevel = getLevelFromXP(oldXP)
    let postedWithLevelUp = false

    setPendingPhotoUri(null)
    setPendingSecondaryUri(null)
    setCaption('')
    setVisibility('friends')
    setTaggedFriends(new Set())
    setShowTagPicker(false)
    await refreshProfile()
    if (workoutRow && typeof (workoutRow as Workout).id === 'string' && (workoutRow as Workout).id.length > 0) {
      setTodayWorkout(workoutRow as Workout)
    } else {
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
    }
    invalidateTodayWorkoutPosted()
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
        postedWithLevelUp = true
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

    if (!postedWithLevelUp) {
      router.dismissTo('/(tabs)/map')
    }
  }

  if (!session) return null
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
        <LogWorkoutBackRow colors={colors} isDark={isDark} />
        <View style={[styles.centered, { flex: 1 }]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <ThemedText style={[styles.loadingText, { color: colors.textMuted }]}>Loading…</ThemedText>
        </View>
      </SafeAreaView>
    )
  }

  if (!todayWorkout && !checkInAllowed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
        <LogWorkoutBackRow colors={colors} isDark={isDark} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.gateScrollContent,
            {
              paddingTop: 8,
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
                backgroundColor: isDark ? colors.tint + '12' : colors.card,
                borderColor: colors.tint + '30',
              },
            ]}
          >
            <View style={[styles.gateIconWrap, { backgroundColor: colors.tint + '22' }]}>
              <Ionicons name="location-outline" size={32} color={colors.tint} />
            </View>
            <Text style={[styles.gateTitle, { color: colors.text, fontFamily: Fonts?.rounded }]}>
              Check in to post
            </Text>
            <ThemedText style={[styles.gateBody, { color: colors.textMuted }]}>
              {!gymId
                ? 'Open the Map, go to a gym, and check in. Then tap Post from the gym sheet to log your workout.'
                : gymName
                  ? `You must be checked in at ${gymName}. Open the Map, step into the gym, then use Post from the bottom sheet.`
                  : 'You must be checked in at this gym on the Map. Step into the gym and open Post from the Map.'}
            </ThemedText>
            <Pressable
              style={[
                styles.primaryButton,
                styles.gatePrimaryBtn,
                {
                  backgroundColor: colors.tint,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.tint + '35',
                },
              ]}
              onPress={() => router.replace('/(tabs)/map')}
            >
              <Text style={[styles.primaryButtonText, fontsLoaded && { fontFamily: 'Outfit_700Bold' }]}>
                Open Map
              </Text>
            </Pressable>
            <Pressable
              style={[styles.gateSecondaryBtn, { borderColor: colors.tint + '40' }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.backButtonText, { color: colors.tint }, fontsLoaded && { fontFamily: 'Outfit_700Bold' }]}>
                Go back
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <LogWorkoutBackRow colors={colors} isDark={isDark} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            !todayWorkout && !pendingPhotoUri && styles.scrollContentCameraIntro,
            !!pendingPhotoUri && styles.scrollContentPreview,
            !!pendingPhotoUri && { minHeight: windowHeight - insets.top - 72 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {todayWorkout ? (
          <View style={styles.doneSection}>
            <Text style={[styles.doneTitle, { color: colors.text, fontFamily: Fonts?.rounded }]}>
              Today{"'"}s workout logged
            </Text>
            <ThemedText style={[styles.doneHint, { color: colors.textMuted }]}>
              You can post one workout per day. Come back tomorrow for the next one.
            </ThemedText>
            <FeedStylePostCard
              primaryUri={todayWorkout.image_url}
              secondaryUri={todayWorkout.secondary_image_url}
              displayName={profile?.display_name || 'You'}
              avatarUrl={profile?.avatar_url ?? null}
              caption={todayWorkout.caption}
              gymLabel={resolvedGymLine}
              dateLabel={
                formatFeedPostTimestamp(todayWorkout.created_at) ||
                formatFeedDate(todayWorkout.workout_date)
              }
            />
            <Pressable
              style={[styles.backButton, { borderColor: colors.tint + '40', borderWidth: 1 }]}
              onPress={() => router.back()}
            >
              <Text
                style={[
                  styles.backButtonText,
                  { color: colors.tint },
                  fontsLoaded && { fontFamily: 'Outfit_700Bold' },
                ]}
              >
                Back to Home
              </Text>
            </Pressable>
          </View>
        ) : !pendingPhotoUri ? (
          <View style={styles.cameraIntroSection}>
            <View
              style={[
                styles.cameraIntroGlyph,
                {
                  borderColor: colors.tint + '45',
                  backgroundColor: colors.tint + (isDark ? '20' : '14'),
                },
              ]}
            >
              <Ionicons name="camera" size={40} color={colors.tint} />
            </View>
            <Pressable
              onPress={handleTakePhoto}
              style={[
                styles.primaryButton,
                styles.cameraIntroCta,
                styles.cameraOpenButton,
                {
                  backgroundColor: colors.tint,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.tint + '35',
                },
              ]}
            >
              <Ionicons name="camera" size={24} color="#fff" style={{ marginRight: 10 }} />
              <Text style={[styles.primaryButtonText, styles.cameraOpenButtonText, { fontFamily: Fonts?.rounded }]}>
                Open camera
              </Text>
            </Pressable>
            <Text
              style={[
                styles.cameraIntroFoot,
                { color: colors.textMuted },
                fontsLoaded && { fontFamily: 'Outfit_600SemiBold' },
              ]}
            >
              {pendingSecondaryUri ? 'Then capture your workout.' : 'One post per day.'}
            </Text>
          </View>
        ) : (
          <View style={[styles.formSection, styles.previewCompose]}>
            <FeedStylePostCard
              primaryUri={pendingPhotoUri!}
              secondaryUri={pendingSecondaryUri}
              displayName={profile?.display_name || 'You'}
              avatarUrl={profile?.avatar_url ?? null}
              caption={caption.trim() || null}
              gymLabel={resolvedGymLine}
              dateLabel="Today"
              taggedNames={taggedPreviewNames.length > 0 ? taggedPreviewNames : undefined}
            />

            <Pressable
              style={styles.retakeButton}
              onPress={() => {
                setPendingPhotoUri(null)
                setPendingSecondaryUri(null)
                cameraPhaseRef.current = 'selfie'
                setCameraPhase('selfie')
                setCameraOpen(true)
              }}
              disabled={uploading}
            >
              <Ionicons name="camera-reverse-outline" size={18} color={colors.tint} />
              <Text
                style={[
                  styles.retakeButtonText,
                  { color: colors.tint },
                  fontsLoaded && { fontFamily: 'Outfit_700Bold' },
                ]}
              >
                Retake both photos
              </Text>
            </Pressable>

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.fieldKicker,
                  { color: colors.textMuted },
                  fontsLoaded && { fontFamily: 'Outfit_700Bold' },
                ]}
              >
                Caption
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? colors.tint + '12' : colors.cardElevated,
                    color: colors.text,
                    borderColor: colors.tint + '30',
                  },
                  fontsLoaded && { fontFamily: 'Outfit_600SemiBold' },
                ]}
                placeholder="What did you train? (optional)"
                placeholderTextColor={isDark ? 'rgba(232,228,240,0.42)' : colors.textMuted}
                value={caption}
                onChangeText={setCaption}
                editable={!uploading}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.fieldKicker,
                  { color: colors.textMuted },
                  fontsLoaded && { fontFamily: 'Outfit_700Bold' },
                ]}
              >
                Who can see this
              </Text>
              <View
                style={[
                  styles.composeAudienceTabs,
                  {
                    backgroundColor: isDark ? colors.cardElevated : colors.card,
                    borderColor: colors.tabBarBorder,
                  },
                ]}
              >
                <Pressable
                  style={[styles.composeAudienceTab, visibility === 'friends' && { backgroundColor: colors.tint }]}
                  onPress={() => setVisibility('friends')}
                  disabled={uploading}
                >
                  <Text
                    style={[styles.composeAudienceTabLabel, { color: visibility === 'friends' ? '#fff' : colors.textMuted }]}
                  >
                    Friends
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.composeAudienceTab, visibility === 'public' && { backgroundColor: colors.tint }]}
                  onPress={() => setVisibility('public')}
                  disabled={uploading}
                >
                  <Text
                    style={[styles.composeAudienceTabLabel, { color: visibility === 'public' ? '#fff' : colors.textMuted }]}
                  >
                    Global
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={[
                styles.tagToggle,
                {
                  backgroundColor: isDark ? colors.tint + '12' : colors.cardElevated,
                  borderColor: colors.tint + '30',
                },
              ]}
              onPress={() => setShowTagPicker(!showTagPicker)}
              disabled={uploading}
            >
              <Ionicons name="people-outline" size={18} color={colors.tint} />
              <Text
                style={[
                  styles.tagToggleText,
                  { color: colors.text },
                  fontsLoaded && { fontFamily: 'Outfit_600SemiBold' },
                ]}
              >
                {taggedFriends.size > 0
                  ? `${taggedFriends.size} friend${taggedFriends.size > 1 ? 's' : ''} tagged`
                  : 'Tag friends'}
              </Text>
              <Ionicons name={showTagPicker ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </Pressable>

            {showTagPicker && (
              <View
                style={[
                  styles.tagList,
                  {
                    backgroundColor: isDark ? colors.tint + '10' : colors.card,
                    borderColor: colors.tint + '28',
                  },
                ]}
              >
                {friends.length === 0 ? (
                  <ThemedText style={[styles.tagEmptyHint, { color: colors.textMuted }]}>
                    Add friends first to tag them
                  </ThemedText>
                ) : (
                  <>
                    <View
                      style={[
                        styles.tagSearchRow,
                        {
                          backgroundColor: isDark ? colors.background : colors.cardElevated,
                          borderColor: colors.tint + '25',
                        },
                      ]}
                    >
                      <Ionicons name="search" size={20} color={colors.textMuted} style={styles.tagSearchIcon} />
                      <TextInput
                        style={[
                          styles.tagSearchInput,
                          { color: colors.text },
                          fontsLoaded && { fontFamily: 'Outfit_600SemiBold' },
                        ]}
                        placeholder="Search friends"
                        placeholderTextColor={isDark ? 'rgba(232,228,240,0.42)' : colors.textMuted}
                        value={tagSearchQuery}
                        onChangeText={setTagSearchQuery}
                        editable={!uploading}
                        autoCorrect={false}
                        autoCapitalize="none"
                        clearButtonMode="never"
                      />
                      {tagSearchQuery.length > 0 ? (
                        <Pressable
                          onPress={() => setTagSearchQuery('')}
                          hitSlop={10}
                          style={styles.tagSearchClear}
                          accessibilityLabel="Clear search"
                        >
                          <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                        </Pressable>
                      ) : null}
                    </View>
                    {filteredFriendsForTag.length === 0 ? (
                      <ThemedText style={[styles.tagEmptyHint, styles.tagNoMatches, { color: colors.textMuted }]}>
                        {`No friends match "${tagSearchQuery.trim()}"`}
                      </ThemedText>
                    ) : (
                      <ScrollView
                        style={styles.tagListScroll}
                        contentContainerStyle={styles.tagListContent}
                        showsVerticalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                      >
                        {filteredFriendsForTag.map((friend) => {
                          const isTagged = taggedFriends.has(friend.id)
                          return (
                            <Pressable
                              key={friend.id}
                              style={[
                                styles.tagRow,
                                {
                                  borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                },
                              ]}
                              onPress={() => {
                                setTaggedFriends((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(friend.id)) next.delete(friend.id)
                                  else next.add(friend.id)
                                  return next
                                })
                              }}
                            >
                              <View style={[styles.tagAvatar, { backgroundColor: colors.tint + '28' }]}>
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
                  </>
                )}
              </View>
            )}

            <Pressable
              onPress={handlePost}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Post workout"
              style={[
                styles.primaryButton,
                styles.previewPostButton,
                {
                  backgroundColor: colors.tint,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.tint + '35',
                },
              ]}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.primaryButtonText, { fontFamily: Fonts?.rounded }]}>
                  Post workout
                </Text>
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
            router.dismissTo('/(tabs)/map')
          }}
          accentColor={levelUpCelebration.level.color}
        />
      )}

      <Modal visible={cameraOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCameraOpen(false)}>
        <CameraCapture
          key={`${cameraPhase}-${pendingSecondaryUri ? '1' : '0'}`}
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
          facing={cameraPhase === 'selfie' ? 'front' : 'back'}
          quality={0.8}
        />
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  logBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardAvoid: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  scrollContentPreview: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    justifyContent: 'flex-start',
  },
  scrollContentCameraIntro: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 8,
  },
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
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    borderWidth: 1,
  },
  gateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  gateTitle: {
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.45,
    fontWeight: '900',
  },
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
  doneTitle: {
    marginBottom: 8,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  doneHint: { textAlign: 'center', marginBottom: 20, paddingHorizontal: 16, fontSize: 13, letterSpacing: 0.2 },
  // 4:5 portrait frame so photos are not cropped
  imageWrap: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 4,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 14,
  },
  /** Leaderboard-aligned preview shell (tint wash + border like list rows). */
  lbPreviewCard: {
    overflow: 'hidden',
    marginBottom: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  feedStyleImageContainer: {
    position: 'relative',
  },
  feedStyleImageFrame: {
    width: '100%',
    aspectRatio: 10 / 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  feedStyleImagePressable: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  feedStyleMainImage: {
    width: '100%',
    height: '100%',
  },
  feedStyleCornerInset: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: '26%',
    aspectRatio: 2 / 3,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.92)',
    zIndex: 5,
  },
  feedStyleCornerImage: {
    width: '100%',
    height: '100%',
  },
  feedStyleGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 64,
    paddingBottom: 16,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
  },
  feedStyleOverlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedStyleAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedStyleAvatarImg: {
    width: 34,
    height: 34,
  },
  feedStyleAvatarInitials: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  feedStyleOverlayTextCol: {
    flex: 1,
    minWidth: 0,
  },
  feedStyleName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedStyleCaption: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 17,
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedStyleLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 6,
    paddingRight: 8,
  },
  feedStyleLocation: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feedStyleMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  feedStyleActionCol: {
    position: 'absolute',
    right: 14,
    bottom: 16,
    alignItems: 'center',
    gap: 20,
  },
  feedStyleTaggedFooter: {
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  feedStyleFooterBar: {
    height: 6,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  feedStyleTaggedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 8,
    paddingRight: 12,
    paddingLeft: 8,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  feedStyleTaggedIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedStyleTaggedTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  feedStyleTaggedKicker: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  feedStyleTaggedNames: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  composeAudienceTabs: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    borderWidth: 1,
  },
  composeAudienceTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 11,
    alignItems: 'center',
  },
  composeAudienceTabLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    fontFamily: Fonts?.rounded,
  },
  previewCompose: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  previewPostButton: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  workoutImage: { width: '100%', height: '100%' },
  cameraIntroSection: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cameraIntroGlyph: {
    width: 88,
    height: 88,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  cameraIntroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  cameraOpenButton: {
    minHeight: 52,
    paddingVertical: 16,
    borderRadius: 14,
  },
  cameraOpenButtonText: {
    fontSize: 18,
    letterSpacing: 0.1,
  },
  cameraIntroFoot: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.65,
    fontWeight: '900',
    marginBottom: 10,
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.05,
    marginBottom: 20,
  },
  fieldGroup: { marginBottom: 20 },
  fieldKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  caption: { marginBottom: 24, textAlign: 'center' },
  backButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  backButtonText: { fontSize: 16, fontWeight: '700' },
  formSection: {},
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
    marginTop: 2,
  },
  retakeButtonText: { fontSize: 15, letterSpacing: -0.1 },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    letterSpacing: 0.1,
  },
  tagToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  tagToggleText: { flex: 1, fontSize: 15 },
  tagList: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    maxHeight: 318,
    borderWidth: 1,
  },
  tagSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 6,
    paddingLeft: 4,
    paddingRight: 6,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
  },
  tagSearchIcon: { marginLeft: 10, marginRight: 4 },
  tagSearchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 8,
    fontSize: 16,
    letterSpacing: -0.1,
  },
  tagSearchClear: { padding: 4 },
  tagListScroll: {
    maxHeight: 236,
  },
  tagListContent: {
    paddingBottom: 10,
  },
  tagNoMatches: {
    paddingVertical: 20,
    paddingHorizontal: 14,
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
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.15 },
})
