import { getCommentsForWorkouts } from '@/lib/comments'
import { getRememberedGymLabel } from '@/lib/gym-label-cache'
import { getFriends } from '@/lib/friends'
import { getReactionsForWorkouts } from '@/lib/reactions'
import { supabase } from '@/lib/supabase'
import { getTagsForWorkouts, type WorkoutTagWithProfile } from '@/lib/tags'
import type { WorkoutCommentWithProfile } from '@/types/comment'
import type { WorkoutReactionWithProfile } from '@/types/reaction'
import type { Workout } from '@/types/workout'

export type FeedItem = {
  workout: Workout
  display_name: string | null
  avatar_url: string | null
  /** Single line for feed UI: "Gym name" or "Gym name · address" */
  gym_label: string | null
  reactions?: WorkoutReactionWithProfile[]
  comments?: WorkoutCommentWithProfile[]
  tags?: WorkoutTagWithProfile[]
}

/** Build display string for a gym row (feed / today's workout). */
export function formatGymLabel(
  name: string | null | undefined,
  address: string | null | undefined,
): string | null {
  const n = name?.trim()
  if (!n) return null
  const a = address?.trim()
  return a ? `${n} · ${a}` : n
}

async function enrichWorkouts(workouts: Workout[]): Promise<FeedItem[]> {
  if (!workouts.length) return []

  const userIds = [...new Set(workouts.map((w) => w.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  const gymIds = [...new Set(workouts.map((w) => w.gym_id).filter((id): id is string => !!id))]
  const gymMap = new Map<string, { name: string; address: string | null }>()
  if (gymIds.length > 0) {
    const { data: gymRows } = await supabase.from('gyms').select('id,name,address').in('id', gymIds)
    for (const row of gymRows ?? []) {
      const g = row as { id: string; name: string; address: string | null }
      gymMap.set(g.id, { name: g.name, address: g.address })
    }
  }

  const items: FeedItem[] = workouts.map((workout) => {
    const p = profileMap.get(workout.user_id)
    const g = workout.gym_id ? gymMap.get(workout.gym_id) : undefined
    const joined = g ? formatGymLabel(g.name, g.address) : null
    const cached = workout.gym_id ? getRememberedGymLabel(workout.gym_id) : null
    return {
      workout,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      gym_label: joined ?? cached,
    }
  })

  const workoutIds = items.map((i) => i.workout.id)
  const [reactionsMap, commentsMap, tagsMap] = await Promise.all([
    getReactionsForWorkouts(workoutIds),
    getCommentsForWorkouts(workoutIds),
    getTagsForWorkouts(workoutIds),
  ])
  return items.map((item) => ({
    ...item,
    reactions: reactionsMap.get(item.workout.id) ?? [],
    comments: commentsMap.get(item.workout.id) ?? [],
    tags: tagsMap.get(item.workout.id) ?? [],
  }))
}

/** YYYY-MM-DD for `workout_date` filters, using the device local calendar. */
function minWorkoutDateForLastNDays(days: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Friends feed + your own posts for the last `daysBack` calendar days, newest first
 * (`workout_date` then `created_at`).
 */
export async function getFriendsWorkouts(
  userId: string,
  daysBack = 30,
  maxRows = 500,
): Promise<FeedItem[]> {
  const friends = await getFriends(userId)
  const friendIds = friends.map((f) => f.id)
  const authorIds = [...new Set([...friendIds, userId])]
  const since = minWorkoutDateForLastNDays(daysBack)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .in('user_id', authorIds)
    .gte('workout_date', since)
    .order('workout_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(maxRows)

  return enrichWorkouts((workouts ?? []) as Workout[])
}

/** Public workouts from all users (including you) for the last `daysBack` days, newest first. */
export async function getGlobalWorkouts(
  _currentUserId: string,
  daysBack = 30,
  maxRows = 500,
): Promise<FeedItem[]> {
  const since = minWorkoutDateForLastNDays(daysBack)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .eq('visibility', 'public')
    .gte('workout_date', since)
    .order('workout_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(maxRows)

  return enrichWorkouts((workouts ?? []) as Workout[])
}
