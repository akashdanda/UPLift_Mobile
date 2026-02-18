import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { getHighlightWithWorkouts, removeWorkoutFromHighlight } from '@/lib/highlights'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/profile'
import type { HighlightWithWorkouts } from '@/types/highlight'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const STORY_DURATION = 5000

export default function HighlightDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const insets = useSafeAreaInsets()

  const [highlight, setHighlight] = useState<HighlightWithWorkouts | null>(null)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  // Epoch counter — bump to force ProgressBar to restart its animation
  const [epoch, setEpoch] = useState(0)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef(0)
  const remainingRef = useRef(STORY_DURATION)

  const isOwner = !!(session && highlight && highlight.user_id === session.user.id)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    getHighlightWithWorkouts(id)
      .then((h) => {
        setHighlight(h)
        if (h) {
          supabase
            .from('profiles')
            .select('*')
            .eq('id', h.user_id)
            .single()
            .then(({ data }) => setOwner(data as Profile | null))
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  useFocusEffect(useCallback(() => void load(), [load]))

  const workoutCount = highlight?.workouts.length ?? 0

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Start the auto-advance timer with the given duration
  const scheduleAdvance = useCallback(
    (idx: number, durationMs: number) => {
      clearTimer()
      startTimeRef.current = Date.now()
      remainingRef.current = durationMs
      timerRef.current = setTimeout(() => {
        if (idx < workoutCount - 1) {
          setCurrentIndex(idx + 1)
        } else {
          router.back()
        }
      }, durationMs)
    },
    [workoutCount, clearTimer]
  )

  // When currentIndex changes, start fresh
  useEffect(() => {
    if (workoutCount === 0 || loading) return
    remainingRef.current = STORY_DURATION
    setEpoch((e) => e + 1)
    scheduleAdvance(currentIndex, STORY_DURATION)
    return clearTimer
  }, [currentIndex, workoutCount, loading, scheduleAdvance, clearTimer])

  // Pause / resume
  useEffect(() => {
    if (workoutCount === 0 || loading) return
    if (paused) {
      // Snapshot how much time remains
      const elapsed = Date.now() - startTimeRef.current
      remainingRef.current = Math.max(0, remainingRef.current - elapsed)
      clearTimer()
    } else {
      // Resume from where we left off
      if (remainingRef.current > 0) {
        scheduleAdvance(currentIndex, remainingRef.current)
      }
    }
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    if (workoutCount === 0) return
    clearTimer()
    if (currentIndex < workoutCount - 1) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      router.back()
    }
  }, [currentIndex, workoutCount, clearTimer])

  const goPrev = useCallback(() => {
    if (workoutCount === 0) return
    clearTimer()
    setCurrentIndex((prev) => Math.max(0, prev - 1))
  }, [workoutCount, clearTimer])

  const handleRemoveWorkout = useCallback(
    (workoutId: string) => {
      if (!highlight || !session) return
      setPaused(true)
      Alert.alert('Remove from highlight', 'Remove this workout from the highlight?', [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => setPaused(false),
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeWorkoutFromHighlight(highlight.id, workoutId, session.user.id)
            if ('error' in result) {
              Alert.alert('Error', result.error.message)
              setPaused(false)
              return
            }
            const updated = await getHighlightWithWorkouts(highlight.id)
            if (!updated || updated.workouts.length === 0) {
              router.back()
              return
            }
            setHighlight(updated)
            setCurrentIndex((prev) => Math.min(prev, updated.workouts.length - 1))
            setPaused(false)
          },
        },
      ])
    },
    [highlight, session]
  )

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: insets.top + 60 }} />
      </View>
    )
  }

  // Not found / empty
  if (!highlight || workoutCount === 0) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.centered}>
          <ThemedText style={{ color: '#ccc' }}>No workouts in this highlight.</ThemedText>
        </View>
      </View>
    )
  }

  const currentWorkout = highlight.workouts[currentIndex]
  const dateStr = currentWorkout
    ? new Date(currentWorkout.workout_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      {/* Full-screen workout image */}
      <Image
        source={{ uri: currentWorkout?.image_url }}
        style={styles.fullImage}
        contentFit="contain"
        transition={150}
      />

      {/* Tap zones: left = prev, right = next */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <Pressable
          style={styles.tapZoneLeft}
          onPress={goPrev}
          onLongPress={() => setPaused(true)}
          onPressOut={() => {
            if (paused) setPaused(false)
          }}
          delayLongPress={200}
        />
        <Pressable
          style={styles.tapZoneRight}
          onPress={goNext}
          onLongPress={() => setPaused(true)}
          onPressOut={() => {
            if (paused) setPaused(false)
          }}
          delayLongPress={200}
        />
      </View>

      {/* Overlay: progress bars + header + caption */}
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Progress bars */}
        <View style={[styles.progressContainer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.progressRow}>
            {highlight.workouts.map((_, i) => (
              <ProgressBar
                key={i}
                state={i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'upcoming'}
                durationMs={STORY_DURATION}
                paused={paused}
                epoch={epoch}
              />
            ))}
          </View>

          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {owner?.avatar_url ? (
                <Image source={{ uri: owner.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={16} color="#ccc" />
                </View>
              )}
              <View>
                <ThemedText style={styles.ownerName}>
                  {owner?.display_name ?? 'User'}
                </ThemedText>
                <ThemedText style={styles.dateText}>{dateStr}</ThemedText>
              </View>
            </View>
            <View style={styles.headerRight}>
              {isOwner && (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/manage-highlights',
                      params: { highlightId: highlight.id },
                    })
                  }
                  hitSlop={12}
                  style={styles.headerBtn}
                >
                  <ThemedText style={styles.editText}>Edit</ThemedText>
                </Pressable>
              )}
              {isOwner && currentWorkout && (
                <Pressable
                  onPress={() => handleRemoveWorkout(currentWorkout.id)}
                  hitSlop={12}
                  style={styles.headerBtn}
                >
                  <Ionicons name="trash-outline" size={22} color="#fff" />
                </Pressable>
              )}
              <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Caption at bottom */}
        {currentWorkout?.caption ? (
          <View style={[styles.captionContainer, { paddingBottom: insets.bottom + 16 }]}>
            <ThemedText style={styles.caption} numberOfLines={3}>
              {currentWorkout.caption}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Paused indicator */}
      {paused && (
        <View style={styles.pausedOverlay} pointerEvents="none">
          <ThemedText style={styles.pausedText}>Paused</ThemedText>
        </View>
      )}
    </View>
  )
}

/**
 * Each ProgressBar owns its own shared value (hook called at top level).
 * The parent tells it: "done" (full), "active" (animating), or "upcoming" (empty).
 */
function ProgressBar({
  state,
  durationMs,
  paused,
  epoch,
}: {
  state: 'done' | 'active' | 'upcoming'
  durationMs: number
  paused: boolean
  epoch: number
}) {
  const progress = useSharedValue(0)
  const pausedAtRef = useRef(0)

  // When bar becomes active or resets, animate from 0 -> 1
  useEffect(() => {
    if (state === 'done') {
      progress.value = 1
    } else if (state === 'upcoming') {
      progress.value = 0
    } else {
      // active: animate 0 → 1
      progress.value = 0
      progress.value = withTiming(1, { duration: durationMs, easing: Easing.linear })
    }
  }, [state, epoch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle pause/resume for the active bar
  useEffect(() => {
    if (state !== 'active') return
    if (paused) {
      // Snapshot current progress and stop animation
      pausedAtRef.current = progress.value
      progress.value = pausedAtRef.current // cancels the running withTiming
    } else {
      // Resume: animate from paused position to 1
      const remaining = (1 - pausedAtRef.current) * durationMs
      if (remaining > 0) {
        progress.value = withTiming(1, { duration: remaining, easing: Easing.linear })
      }
    }
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }))

  return (
    <View style={styles.progressBarBg}>
      <Animated.View style={[styles.progressBarFill, animStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },

  // Tap zones
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  tapZoneLeft: {
    flex: 1,
  },
  tapZoneRight: {
    flex: 2,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  // Progress bars
  progressContainer: {
    paddingHorizontal: 8,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
  },
  progressBarBg: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerBtn: {
    padding: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dateText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  editText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Caption
  captionContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  caption: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // Paused
  pausedOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -30 }, { translateY: -12 }],
  },
  pausedText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },

  // Top bar (for empty / not found)
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
})
