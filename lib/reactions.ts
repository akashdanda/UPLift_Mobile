import { supabase } from '@/lib/supabase'
import { uploadReactionImage } from '@/lib/reaction-upload'
import type { WorkoutReactionWithProfile } from '@/types/reaction'

/** Fetch all reactions for the given workout IDs, with reactor profile info */
export async function getReactionsForWorkouts(
  workoutIds: string[]
): Promise<Map<string, WorkoutReactionWithProfile[]>> {
  if (workoutIds.length === 0) return new Map()

  const { data: rows } = await supabase
    .from('workout_reactions')
    .select('id, workout_id, user_id, emoji, reaction_image_url, created_at')
    .in('workout_id', workoutIds)
    .order('created_at', { ascending: true })

  if (!rows?.length) return new Map()

  const userIds = [...new Set((rows as { user_id: string }[]).map((r) => r.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  const withProfile = (rows as Array<{
    id: string
    workout_id: string
    user_id: string
    emoji: string
    reaction_image_url: string | null
    created_at: string
  }>).map((r) => {
    const p = profileMap.get(r.user_id)
    return {
      ...r,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    } as WorkoutReactionWithProfile
  })

  const map = new Map<string, WorkoutReactionWithProfile[]>()
  for (const r of withProfile) {
    const list = map.get(r.workout_id) ?? []
    list.push(r)
    map.set(r.workout_id, list)
  }
  return map
}

/** Add or replace current user's reaction (photo + emoji). One reaction per user per workout. */
export async function addReaction(
  workoutId: string,
  userId: string,
  emoji: string,
  reactionImageUri: string | null
): Promise<{ ok: true } | { error: Error }> {
  try {
    let reactionImageUrl: string | null = null
    if (reactionImageUri) {
      const upload = await uploadReactionImage(workoutId, userId, reactionImageUri)
      if ('error' in upload) return upload
      reactionImageUrl = upload.url
    }

    const { error } = await supabase.from('workout_reactions').upsert(
      {
        workout_id: workoutId,
        user_id: userId,
        emoji,
        reaction_image_url: reactionImageUrl,
      },
      { onConflict: 'workout_id,user_id' }
    )

    if (error) return { error }
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('Failed to add reaction') }
  }
}

/** Remove current user's reaction */
export async function removeReaction(workoutId: string, userId: string): Promise<{ ok: true } | { error: Error }> {
  const { error } = await supabase
    .from('workout_reactions')
    .delete()
    .eq('workout_id', workoutId)
    .eq('user_id', userId)

  if (error) return { error }
  return { ok: true }
}
