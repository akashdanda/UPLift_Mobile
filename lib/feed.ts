import { getCommentsForWorkouts } from '@/lib/comments'
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
  reactions?: WorkoutReactionWithProfile[]
  comments?: WorkoutCommentWithProfile[]
  tags?: WorkoutTagWithProfile[]
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

  const items: FeedItem[] = workouts.map((workout) => {
    const p = profileMap.get(workout.user_id)
    return {
      workout,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
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

/** Fetch friends' workouts (most recent first) */
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

  return enrichWorkouts((workouts ?? []) as Workout[])
}

/** Fetch public workouts from all users (global feed) */
export async function getGlobalWorkouts(currentUserId: string, limit = 30): Promise<FeedItem[]> {
  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .eq('visibility', 'public')
    .neq('user_id', currentUserId)
    .order('workout_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  return enrichWorkouts((workouts ?? []) as Workout[])
}
