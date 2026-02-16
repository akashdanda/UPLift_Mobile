import { supabase } from '@/lib/supabase'
import type { HighlightForProfile, HighlightWithWorkouts } from '@/types/highlight'
import type { Workout } from '@/types/workout'

/** Fetch highlights for a user's profile (cover image + count). Ordered by display_order, then created_at. */
export async function getHighlightsForProfile(userId: string): Promise<HighlightForProfile[]> {
  const { data: highlights } = await supabase
    .from('workout_highlights')
    .select('*')
    .eq('user_id', userId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!highlights?.length) return []

  const highlightIds = highlights.map((h) => h.id)

  const { data: items } = await supabase
    .from('workout_highlight_items')
    .select('highlight_id')
    .in('highlight_id', highlightIds)

  const countByHighlight = new Map<string, number>()
  for (const item of items ?? []) {
    const id = (item as { highlight_id: string }).highlight_id
    countByHighlight.set(id, (countByHighlight.get(id) ?? 0) + 1)
  }

  const coverWorkoutIds = highlights
    .map((h) => (h as { cover_workout_id?: string | null }).cover_workout_id)
    .filter(Boolean) as string[]

  let coverUrlMap = new Map<string, string>()
  if (coverWorkoutIds.length > 0) {
    const { data: workouts } = await supabase
      .from('workouts')
      .select('id, image_url')
      .in('id', coverWorkoutIds)
    for (const w of workouts ?? []) {
      const row = w as { id: string; image_url: string }
      coverUrlMap.set(row.id, row.image_url)
    }
  }

  return highlights.map((h) => {
    const row = h as {
      id: string
      user_id: string
      name: string
      cover_workout_id: string | null
      cover_image_url: string | null
      display_order: number
      created_at: string
    }
    const resolvedCoverUrl =
      row.cover_image_url ?? (row.cover_workout_id ? coverUrlMap.get(row.cover_workout_id) ?? null : null)
    return {
      ...row,
      cover_image_url: resolvedCoverUrl,
      workouts_count: countByHighlight.get(row.id) ?? 0,
    } as HighlightForProfile
  })
}

/** Fetch a single highlight with full workout list (for detail view). */
export async function getHighlightWithWorkouts(highlightId: string): Promise<HighlightWithWorkouts | null> {
  const { data: highlight } = await supabase
    .from('workout_highlights')
    .select('*')
    .eq('id', highlightId)
    .single()

  if (!highlight) return null

  const { data: items } = await supabase
    .from('workout_highlight_items')
    .select('workout_id, display_order')
    .eq('highlight_id', highlightId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!items?.length) {
    return {
      ...(highlight as HighlightWithWorkouts),
      workouts: [],
    }
  }

  const workoutIds = (items as { workout_id: string }[]).map((i) => i.workout_id)
  const { data: workouts } = await supabase
    .from('workouts')
    .select('*')
    .in('id', workoutIds)

  const orderMap = new Map(
    (items as { workout_id: string; display_order: number }[]).map((i) => [i.workout_id, i.display_order])
  )
  const sorted = (workouts as Workout[]).sort(
    (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
  )

  return {
    ...(highlight as HighlightWithWorkouts),
    workouts: sorted,
  }
}

/** Create a new highlight (user must be owner). */
export async function createHighlight(
  userId: string,
  name: string
): Promise<{ ok: true; id: string } | { error: Error }> {
  const { data, error } = await supabase
    .from('workout_highlights')
    .insert({ user_id: userId, name })
    .select('id')
    .single()

  if (error) return { error }
  return { ok: true, id: data.id }
}

/** Update highlight name or cover. */
export async function updateHighlight(
  highlightId: string,
  userId: string,
  updates: { name?: string; cover_workout_id?: string | null; cover_image_url?: string | null }
): Promise<{ ok: true } | { error: Error }> {
  const { error } = await supabase
    .from('workout_highlights')
    .update(updates)
    .eq('id', highlightId)
    .eq('user_id', userId)

  if (error) return { error }
  return { ok: true }
}

/** Delete a highlight. */
export async function deleteHighlight(highlightId: string, userId: string): Promise<{ ok: true } | { error: Error }> {
  const { error } = await supabase
    .from('workout_highlights')
    .delete()
    .eq('id', highlightId)
    .eq('user_id', userId)

  if (error) return { error }
  return { ok: true }
}

/** Add a workout to a highlight (workout must belong to current user). */
export async function addWorkoutToHighlight(
  highlightId: string,
  workoutId: string,
  userId: string
): Promise<{ ok: true } | { error: Error }> {
  const { data: highlight } = await supabase
    .from('workout_highlights')
    .select('id')
    .eq('id', highlightId)
    .eq('user_id', userId)
    .single()

  if (!highlight) return { error: new Error('Highlight not found') }

  const { data: maxOrder } = await supabase
    .from('workout_highlight_items')
    .select('display_order')
    .eq('highlight_id', highlightId)
    .order('display_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (maxOrder as { display_order?: number } | null)?.display_order ?? 0

  const { error } = await supabase.from('workout_highlight_items').insert({
    highlight_id: highlightId,
    workout_id: workoutId,
    display_order: nextOrder + 1,
  })

  if (error) return { error }
  return { ok: true }
}

/** Remove a workout from a highlight. */
export async function removeWorkoutFromHighlight(
  highlightId: string,
  workoutId: string,
  userId: string
): Promise<{ ok: true } | { error: Error }> {
  const { error } = await supabase
    .from('workout_highlight_items')
    .delete()
    .eq('highlight_id', highlightId)
    .eq('workout_id', workoutId)

  if (error) return { error }

  const { data: highlight } = await supabase
    .from('workout_highlights')
    .select('cover_workout_id')
    .eq('id', highlightId)
    .eq('user_id', userId)
    .single()

  if (highlight && (highlight as { cover_workout_id: string | null }).cover_workout_id === workoutId) {
    await supabase
      .from('workout_highlights')
      .update({ cover_workout_id: null, cover_image_url: null })
      .eq('id', highlightId)
      .eq('user_id', userId)
  }

  return { ok: true }
}

/** Set which workout is the cover for the highlight (clears custom cover_image_url). */
export async function setHighlightCover(
  highlightId: string,
  userId: string,
  coverWorkoutId: string | null
): Promise<{ ok: true } | { error: Error }> {
  return updateHighlight(highlightId, userId, {
    cover_workout_id: coverWorkoutId,
    cover_image_url: null,
  })
}

/** Set custom cover image URL (e.g. from camera roll upload; clears cover_workout_id). */
export async function setHighlightCoverImage(
  highlightId: string,
  userId: string,
  coverImageUrl: string | null
): Promise<{ ok: true } | { error: Error }> {
  return updateHighlight(highlightId, userId, {
    cover_image_url: coverImageUrl,
    cover_workout_id: null,
  })
}
