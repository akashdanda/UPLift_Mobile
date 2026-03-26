import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { WorkoutDualImageGrid } from '@/components/workout-dual-image'
import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  addWorkoutToHighlight,
  getHighlightWithWorkouts,
  removeWorkoutFromHighlight,
  setHighlightCover,
} from '@/lib/highlights'
import { supabase } from '@/lib/supabase'
import type { Workout } from '@/types/workout'

const COLS = 3
const GAP = 4

export default function AddWorkoutsToHighlightScreen() {
  const { highlightId } = useLocalSearchParams<{ highlightId: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [inHighlightIds, setInHighlightIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [mutatingId, setMutatingId] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!session || !highlightId) return
    setLoading(true)
    Promise.all([
      getHighlightWithWorkouts(highlightId).then((h) => {
        if (h) setInHighlightIds(new Set(h.workouts.map((w) => w.id)))
      }),
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', session.user.id)
        .order('workout_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)
        .then(({ data }) => setWorkouts((data as Workout[]) ?? [])),
    ]).finally(() => setLoading(false))
  }, [session, highlightId])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async (workoutId: string) => {
    if (!session || !highlightId) return
    if (inHighlightIds.has(workoutId)) return
    const wasEmpty = inHighlightIds.size === 0
    setMutatingId(workoutId)
    const result = await addWorkoutToHighlight(highlightId, workoutId, session.user.id)
    setMutatingId(null)
    if ('error' in result) return
    setInHighlightIds((prev) => new Set([...prev, workoutId]))
    if (wasEmpty) await setHighlightCover(highlightId, session.user.id, workoutId)
  }

  const handleRemove = async (workoutId: string) => {
    if (!session || !highlightId) return
    if (!inHighlightIds.has(workoutId)) return
    setMutatingId(workoutId)
    const result = await removeWorkoutFromHighlight(highlightId, workoutId, session.user.id)
    setMutatingId(null)
    if ('error' in result) return
    if (result.highlightDeleted) {
      router.back()
      return
    }
    setInHighlightIds((prev) => {
      const next = new Set(prev)
      next.delete(workoutId)
      return next
    })
  }

  const screenWidth = Dimensions.get('window').width
  const size = (screenWidth - (COLS + 1) * GAP) / COLS

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.grid, { padding: GAP, paddingBottom: 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {workouts.map((workout) => {
              const inHighlight = inHighlightIds.has(workout.id)
              const mutating = mutatingId === workout.id
              return (
                <View key={workout.id} style={[styles.gridItem, { width: size, height: size }]}>
                  <WorkoutDualImageGrid
                    primaryUri={workout.image_url}
                    secondaryUri={workout.secondary_image_url}
                    style={styles.gridImage}
                  />
                  <View style={styles.overlay}>
                    <View
                      style={[
                        styles.toggleTrack,
                        {
                          borderColor: `${colors.tint}55`,
                          backgroundColor: colorScheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)',
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => handleAdd(workout.id)}
                        disabled={mutating || inHighlight}
                        style={({ pressed }) => [
                          styles.toggleSegment,
                          !inHighlight
                            ? { backgroundColor: colors.tint }
                            : { backgroundColor: 'transparent' },
                          pressed && !inHighlight && { opacity: 0.85 },
                          (mutating || inHighlight) && styles.toggleSegmentDisabled,
                        ]}
                      >
                        {mutating && !inHighlight ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <ThemedText
                            style={[
                              styles.toggleSegmentText,
                              { color: !inHighlight ? '#fff' : colors.textMuted },
                            ]}
                          >
                            Add
                          </ThemedText>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => handleRemove(workout.id)}
                        disabled={mutating || !inHighlight}
                        style={({ pressed }) => [
                          styles.toggleSegment,
                          inHighlight
                            ? { backgroundColor: colors.tint }
                            : { backgroundColor: 'transparent' },
                          pressed && inHighlight && { opacity: 0.85 },
                          (mutating || !inHighlight) && styles.toggleSegmentDisabled,
                        ]}
                      >
                        {mutating && inHighlight ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color={inHighlight ? '#fff' : colors.textMuted}
                          />
                        )}
                      </Pressable>
                    </View>
                  </View>
                </View>
              )
            })}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.tabBarBorder, backgroundColor: colors.background }]}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.doneBtn, { backgroundColor: colors.tint }]}
            >
              <ThemedText style={styles.doneBtnText}>Done</ThemedText>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  gridItem: { borderRadius: 4, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  toggleTrack: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 32,
  },
  toggleSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  toggleSegmentDisabled: {
    opacity: 0.45,
  },
  toggleSegmentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
