import Ionicons from '@expo/vector-icons/Ionicons'
import { Image } from 'expo-image'
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

import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useAuthContext } from '@/hooks/use-auth-context'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { addWorkoutToHighlight, getHighlightWithWorkouts, setHighlightCover } from '@/lib/highlights'
import { supabase } from '@/lib/supabase'
import type { Workout } from '@/types/workout'

const COLS = 3
const GAP = 4

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AddWorkoutsToHighlightScreen() {
  const { highlightId } = useLocalSearchParams<{ highlightId: string }>()
  const { session } = useAuthContext()
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [inHighlightIds, setInHighlightIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)

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
    setAddingId(workoutId)
    const result = await addWorkoutToHighlight(highlightId, workoutId, session.user.id)
    setAddingId(null)
    if ('error' in result) return
    setInHighlightIds((prev) => new Set([...prev, workoutId]))
    if (wasEmpty) await setHighlightCover(highlightId, session.user.id, workoutId)
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
              const adding = addingId === workout.id
              return (
                <View key={workout.id} style={[styles.gridItem, { width: size, height: size }]}>
                  <Image source={{ uri: workout.image_url }} style={styles.gridImage} />
                  <View style={styles.overlay}>
                    {inHighlight ? (
                      <View style={[styles.badge, { backgroundColor: colors.tint }]}>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => handleAdd(workout.id)}
                        disabled={adding}
                        style={[styles.addBtn, { backgroundColor: colors.tint }]}
                      >
                        {adding ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <ThemedText style={styles.addBtnText}>Add</ThemedText>
                        )}
                      </Pressable>
                    )}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
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
