import { supabase } from '@/lib/supabase'
import { pushComment } from '@/lib/push-notifications'
import type { WorkoutCommentWithProfile } from '@/types/comment'

/** Fetch all comments for the given workout IDs, with commenter profile, ordered by created_at asc */
export async function getCommentsForWorkouts(
  workoutIds: string[]
): Promise<Map<string, WorkoutCommentWithProfile[]>> {
  if (workoutIds.length === 0) return new Map()

  // Use select('*') so this still works if `parent_id` hasn’t been migrated yet
  // (requesting a missing column makes the whole query fail → empty UI, looks like “deleted”).
  const { data: rows, error } = await supabase
    .from('workout_comments')
    .select('*')
    .in('workout_id', workoutIds)
    .order('created_at', { ascending: true })

  if (error || !rows?.length) return new Map()

  const userIds = [...new Set((rows as { user_id: string }[]).map((r) => r.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  const withProfile = (rows as Record<string, unknown>[]).map((raw) => {
    const r = raw as {
      id: string
      workout_id: string
      user_id: string
      parent_id?: string | null
      message: string | null
      gif_url: string | null
      created_at: string
    }
    const p = profileMap.get(r.user_id)
    return {
      ...r,
      parent_id: r.parent_id ?? null,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    } as WorkoutCommentWithProfile
  })

  const map = new Map<string, WorkoutCommentWithProfile[]>()
  for (const c of withProfile) {
    const list = map.get(c.workout_id) ?? []
    list.push(c)
    map.set(c.workout_id, list)
  }
  return map
}

/** Add a comment (text and/or GIF). At least one of message or gifUrl must be provided. */
export async function addComment(
  workoutId: string,
  userId: string,
  opts: { message?: string | null; gifUrl?: string | null; parentId?: string | null }
): Promise<{ ok: true; id: string } | { error: Error }> {
  const message = opts.message?.trim() || null
  const gifUrl = opts.gifUrl?.trim() || null
  if (!message && !gifUrl) return { error: new Error('Add some text or a GIF') }

  const parentId = opts.parentId?.trim() || null

  const { data, error } = await supabase
    .from('workout_comments')
    .insert({
      workout_id: workoutId,
      user_id: userId,
      parent_id: parentId,
      message,
      gif_url: gifUrl,
    })
    .select('id')
    .single()

  if (error) return { error }

  try {
    const { data: workout } = await supabase
      .from('workouts')
      .select('user_id')
      .eq('id', workoutId)
      .maybeSingle()
    const ownerId = (workout as { user_id: string } | null)?.user_id
    if (ownerId && ownerId !== userId) {
      await pushComment(ownerId, userId)
    }
  } catch {
    // best-effort
  }

  return { ok: true, id: data.id }
}

/** Delete your own comment */
export async function deleteComment(commentId: string, userId: string): Promise<{ ok: true } | { error: Error }> {
  const { error } = await supabase
    .from('workout_comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId)

  if (error) return { error }
  return { ok: true }
}
