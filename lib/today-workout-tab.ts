import { supabase } from '@/lib/supabase'

export function getTodayLocalYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const invalidateListeners = new Set<() => void>()

export function subscribeTodayWorkoutPostedInvalidate(fn: () => void): () => void {
  invalidateListeners.add(fn)
  return () => {
    invalidateListeners.delete(fn)
  }
}

/** Call after a workout is successfully logged today so the tab bar can hide the post button. */
export function invalidateTodayWorkoutPosted(): void {
  invalidateListeners.forEach((fn) => fn())
}

export async function fetchHasWorkoutToday(userId: string): Promise<boolean> {
  const today = getTodayLocalYmd()
  const { data } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('workout_date', today)
    .maybeSingle()
  return !!data
}
