import Ionicons from '@expo/vector-icons/Ionicons'
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_900Black, useFonts } from '@expo-google-fonts/outfit'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
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
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { CameraCapture } from '@/components/camera-capture'
import { CelebrationModal } from '@/components/celebration-modal'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getFriends } from '@/lib/friends'
import { computeXP, getLevelFromXP } from '@/lib/levels'
import { pushFirstFriendWorkout } from '@/lib/push-notifications'
import { isCheckedInAtGym } from '@/lib/presence-service'
import { supabase } from '@/lib/supabase'
import { uploadWorkoutImage } from '@/lib/workout-upload'
import type { UserLevel } from '@/types/level'
import type { Workout, WorkoutVisibility } from '@/types/workout'

/** Stored for analytics / feed; no longer user-selectable in this screen. */
const DEFAULT_WORKOUT_TYPE = 'strength' as const

/** Primary CTA — matches map / gym sheet purple. */
const CTA_PURPLE = '#5239FF'

function DualPhotoPreview({ primaryUri, secondaryUri }: { primaryUri: string; secondaryUri: string }) {
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
  colors: { text: string }
  isDark: boolean
}) {
  return (
    <View
      style={[
        styles.logBackRow,
        { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        style={[
          styles.logBackButton,
          { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
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
  const previewPhotoHeight = Math.min(Math.round(windowHeight * 0.72), 640)
  const [fontsLoaded] = useFonts({
    Outfit_900Black,
    Outfit_700Bold,
    Outfit_600SemiBold,
  })

  const [todayWorkout, setTodayWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkInAllowed, setCheckInAllowed] = useState(false)
  const [uploading, setUploading] = useState(false)
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

  const postVisibility: WorkoutVisibility = 'friends'

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
      caption: null,
      visibility: postVisibility,
    }
    const rowLegacy = {
      user_id: session.user.id,
      workout_date: today,
      image_url: uploadResult.url,
      secondary_image_url: secondaryUrl,
      workout_type: DEFAULT_WORKOUT_TYPE,
      caption: null,
      visibility: postVisibility,
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

    // Compute level BEFORE refreshing profile (to detect level-up)
    const oldXP = profile
      ? computeXP(profile, 0)
      : 0
    const oldLevel = getLevelFromXP(oldXP)

    setPendingPhotoUri(null)
    setPendingSecondaryUri(null)
    await refreshProfile()
    setTodayWorkout({
      id: '',
      user_id: session.user.id,
      gym_id: gymId,
      workout_date: today,
      image_url: uploadResult.url,
      secondary_image_url: secondaryUrl ?? null,
      workout_type: DEFAULT_WORKOUT_TYPE,
      caption: null,
      visibility: postVisibility,
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
                backgroundColor: colors.card,
                borderColor: colors.tabBarBorder,
              },
            ]}
          >
            <View style={[styles.gateIconWrap, { backgroundColor: `${CTA_PURPLE}22` }]}>
              <Ionicons name="location-outline" size={32} color={CTA_PURPLE} />
            </View>
            <Text
              style={[
                styles.gateTitle,
                { color: colors.text },
                fontsLoaded && { fontFamily: 'Outfit_900Black' },
              ]}
            >
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
                  backgroundColor: CTA_PURPLE,
                  borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
                },
              ]}
              onPress={() => router.replace('/(tabs)/map')}
            >
              <Text style={[styles.primaryButtonText, fontsLoaded && { fontFamily: 'Outfit_700Bold' }]}>
                Open Map
              </Text>
            </Pressable>
            <Pressable
              style={[styles.gateSecondaryBtn, { borderColor: CTA_PURPLE }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.backButtonText, { color: CTA_PURPLE }, fontsLoaded && { fontFamily: 'Outfit_700Bold' }]}>
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
            <Text
              style={[
                styles.doneTitle,
                { color: colors.text },
                fontsLoaded && { fontFamily: 'Outfit_900Black' },
              ]}
            >
              Today{"'"}s workout logged
            </Text>
            <ThemedText style={[styles.doneHint, { color: colors.textMuted }]}>
              You can post one workout per day. Come back tomorrow for the next one.
            </ThemedText>
            <View
              style={[
                styles.imageWrap,
                {
                  backgroundColor: colors.card,
                  shadowOpacity: isDark ? 0.35 : 0.12,
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                },
              ]}
            >
              {todayWorkout.secondary_image_url ? (
                <DualPhotoPreview
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
            <Pressable
              style={[styles.backButton, { borderColor: CTA_PURPLE, borderWidth: 1.5 }]}
              onPress={() => router.back()}
            >
              <Text
                style={[
                  styles.backButtonText,
                  { color: CTA_PURPLE },
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
                  borderColor: `${CTA_PURPLE}4d`,
                  backgroundColor: isDark ? `${CTA_PURPLE}18` : `${CTA_PURPLE}12`,
                },
              ]}
            >
              <Ionicons name="camera" size={44} color={CTA_PURPLE} />
            </View>
            <Pressable
              onPress={handleTakePhoto}
              style={[
                styles.primaryButton,
                styles.cameraIntroCta,
                styles.cameraOpenButton,
                {
                  backgroundColor: CTA_PURPLE,
                  shadowOpacity: isDark ? 0.5 : 0.22,
                  borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              <Ionicons name="camera" size={24} color="#fff" style={{ marginRight: 10 }} />
              <Text
                style={[
                  styles.primaryButtonText,
                  styles.cameraOpenButtonText,
                  fontsLoaded && { fontFamily: 'Outfit_700Bold' },
                ]}
              >
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
            <View
              style={[
                styles.imageWrapLarge,
                {
                  height: previewPhotoHeight,
                  backgroundColor: colors.card,
                  shadowOpacity: isDark ? 0.4 : 0.14,
                  borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
                },
              ]}
            >
              {pendingSecondaryUri ? (
                <DualPhotoPreview primaryUri={pendingPhotoUri!} secondaryUri={pendingSecondaryUri!} />
              ) : (
                <Image source={{ uri: pendingPhotoUri! }} style={styles.workoutImage} />
              )}
            </View>

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
              <Ionicons name="camera-reverse-outline" size={18} color={CTA_PURPLE} />
              <Text
                style={[
                  styles.retakeButtonText,
                  { color: CTA_PURPLE },
                  fontsLoaded && { fontFamily: 'Outfit_700Bold' },
                ]}
              >
                Retake both photos
              </Text>
            </Pressable>

            <Pressable
              onPress={handlePost}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel="Post workout"
              style={[
                styles.primaryButton,
                styles.previewPostButton,
                {
                  backgroundColor: CTA_PURPLE,
                  shadowOpacity: isDark ? 0.45 : 0.2,
                  borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="arrow-up-circle" size={34} color="#fff" />
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
  scrollContent: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 48 },
  scrollContentPreview: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    justifyContent: 'flex-start',
  },
  scrollContentCameraIntro: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 4,
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
  doneHint: { textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
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
  imageWrapLarge: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 14,
  },
  previewCompose: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  previewPostButton: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  workoutImage: { width: '100%', height: '100%' },
  dualPreview: { width: '100%', height: '100%', position: 'relative' },
  dualPreviewMain: { width: '100%', height: '100%' },
  dualPreviewSecondaryWrap: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: '30%',
    aspectRatio: 4 / 5,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  dualPreviewSecondary: { width: '100%', height: '100%' },
  cameraIntroSection: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cameraIntroGlyph: {
    width: 100,
    height: 100,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  cameraIntroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  cameraOpenButton: {
    minHeight: 58,
    paddingVertical: 18,
    borderRadius: 16,
  },
  cameraOpenButtonText: {
    fontSize: 18,
    letterSpacing: 0.1,
  },
  cameraIntroFoot: {
    marginTop: 18,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    letterSpacing: -0.05,
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
  fieldGroup: { marginBottom: 22 },
  fieldKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 10,
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
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    borderWidth: 1,
    letterSpacing: -0.1,
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
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
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
  visibilityRow: {
    flexDirection: 'row',
    gap: 12,
  },
  visibilityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  visibilityLabel: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderWidth: 1,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.15 },
})
