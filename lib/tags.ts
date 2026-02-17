import { supabase } from '@/lib/supabase'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export type WorkoutTag = {
  id: string
  workout_id: string
  tagged_user_id: string
  created_at: string
}

export type WorkoutTagWithProfile = WorkoutTag & {
  display_name: string | null
  avatar_url: string | null
}

// ──────────────────────────────────────────────
// Add tags to a workout (batch)
// ──────────────────────────────────────────────
export async function addWorkoutTags(
  workoutId: string,
  taggedUserIds: string[]
): Promise<{ error: Error | null }> {
  if (taggedUserIds.length === 0) return { error: null }

  const rows = taggedUserIds.map((uid) => ({
    workout_id: workoutId,
    tagged_user_id: uid,
  }))

  const { error } = await supabase.from('workout_tags').insert(rows)
  return { error: error ?? null }
}

// ──────────────────────────────────────────────
// Remove a tag from a workout
// ──────────────────────────────────────────────
export async function removeWorkoutTag(
  workoutId: string,
  taggedUserId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('workout_tags')
    .delete()
    .eq('workout_id', workoutId)
    .eq('tagged_user_id', taggedUserId)

  return { error: error ?? null }
}

// ──────────────────────────────────────────────
// Get tags for a workout (with profile info)
// ──────────────────────────────────────────────
export async function getWorkoutTags(
  workoutId: string
): Promise<WorkoutTagWithProfile[]> {
  const { data } = await supabase
    .from('workout_tags')
    .select('*')
    .eq('workout_id', workoutId)

  if (!data?.length) return []

  const userIds = data.map((t: WorkoutTag) => t.tagged_user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  return (data as WorkoutTag[]).map((t) => {
    const p = profileMap.get(t.tagged_user_id)
    return {
      ...t,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    }
  })
}

// ──────────────────────────────────────────────
// Batch-fetch tags for multiple workouts
// ──────────────────────────────────────────────
export async function getTagsForWorkouts(
  workoutIds: string[]
): Promise<Map<string, WorkoutTagWithProfile[]>> {
  const map = new Map<string, WorkoutTagWithProfile[]>()
  if (workoutIds.length === 0) return map

  const { data } = await supabase
    .from('workout_tags')
    .select('*')
    .in('workout_id', workoutIds)

  if (!data?.length) return map

  const userIds = [...new Set((data as WorkoutTag[]).map((t) => t.tagged_user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  for (const t of data as WorkoutTag[]) {
    if (!map.has(t.workout_id)) map.set(t.workout_id, [])
    const p = profileMap.get(t.tagged_user_id)
    map.get(t.workout_id)!.push({
      ...t,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    })
  }

  return map
}

// ──────────────────────────────────────────────
// Get workouts a user has been tagged in (for notifications / feed)
// ──────────────────────────────────────────────
export async function getWorkoutsTaggedIn(
  userId: string,
  limit = 20
): Promise<WorkoutTag[]> {
  const { data } = await supabase
    .from('workout_tags')
    .select('*')
    .eq('tagged_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as WorkoutTag[]
}
