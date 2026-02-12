import { getFriends } from '@/lib/friends'
import { supabase } from '@/lib/supabase'
import type { Workout } from '@/types/workout'

export type FeedItem = {
  workout: Workout
  display_name: string | null
  avatar_url: string | null
}

/** Fetch friends' workouts (most recent first), for the feed below the user's own workout */
export async function getFriendsWorkouts(userId: string, limit = 30): Promise<FeedItem[]> {
  const friends = await getFriends(userId)
  const friendIds = friends.map((f) => f.id)
  if (friendIds.length === 0) return []

  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .in('user_id', friendIds)
    .order('workout_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!workouts?.length) return []

  const userIds = [...new Set((workouts as Workout[]).map((w) => w.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p]))

  return (workouts as Workout[]).map((workout) => {
    const p = profileMap.get(workout.user_id)
    return {
      workout,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    }
  })
}
