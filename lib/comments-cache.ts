import AsyncStorage from '@react-native-async-storage/async-storage'

import { getCommentsForWorkouts } from '@/lib/comments'
import type { WorkoutCommentWithProfile } from '@/types/comment'

type CacheEnvelope<T> = { v: 1; t: number; data: T }

const KEY = (workoutId: string) => `uplift_comments_v1:${workoutId}`

const memory = new Map<string, CacheEnvelope<WorkoutCommentWithProfile[]>>()

export function seedCommentsCache(workoutId: string, items: WorkoutCommentWithProfile[]) {
  memory.set(workoutId, { v: 1, t: Date.now(), data: items })
  void AsyncStorage.setItem(KEY(workoutId), JSON.stringify({ v: 1, t: Date.now(), data: items })).catch(() => {})
}

export async function loadCachedComments(workoutId: string): Promise<WorkoutCommentWithProfile[] | null> {
  const mem = memory.get(workoutId)
  if (mem) return mem.data
  try {
    const raw = await AsyncStorage.getItem(KEY(workoutId))
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<WorkoutCommentWithProfile[]>
    if (!env?.data || !Array.isArray(env.data)) return null
    memory.set(workoutId, env)
    return env.data
  } catch {
    return null
  }
}

/**
 * Cache-first comment preload for a single workout.
 * - Returns cached immediately (if present)
 * - Refreshes silently in background
 */
export async function preloadComments(opts: {
  workoutId: string
  onItems?: (items: WorkoutCommentWithProfile[], source: 'cache' | 'network') => void
}): Promise<void> {
  const { workoutId, onItems } = opts

  const cached = await loadCachedComments(workoutId)
  if (cached) onItems?.(cached, 'cache')

  void getCommentsForWorkouts([workoutId])
    .then((map) => {
      const items = map.get(workoutId) ?? []
      const env: CacheEnvelope<WorkoutCommentWithProfile[]> = { v: 1, t: Date.now(), data: items }
      memory.set(workoutId, env)
      void AsyncStorage.setItem(KEY(workoutId), JSON.stringify(env)).catch(() => {})
      onItems?.(items, 'network')
    })
    .catch(() => {})
}

