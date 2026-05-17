import { getCommentsForWorkouts } from '@/lib/comments'
import { getRememberedGymLabel, rememberGymLabel } from '@/lib/gym-label-cache'
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
  
  // Format as "Gym Name, City, State" - extract city/state from address
  const a = address?.trim()
  if (!a) return n
  
  const shortLocation = extractCityState(a)
  return shortLocation ? `${n}, ${shortLocation}` : n
}

/** Extract "City, State" from a full address string. */
export function extractCityState(address: string | null | undefined): string | null {
  if (!address) return null
  const a = address.trim()
  if (!a) return null

  // Common US state abbreviations
  const stateAbbrevs = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i

  // Split by comma
  const parts = a.split(',').map((p) => p.trim()).filter(Boolean)

  // Look for state abbreviation in any part (usually last or second-to-last)
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    // Match state abbreviation (optionally followed by ZIP)
    const stateMatch = part.match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/i)
    if (stateMatch && i > 0) {
      const state = stateMatch[1].toUpperCase()
      // Previous part should be the city - skip parts that look like street addresses
      for (let j = i - 1; j >= 0; j--) {
        const cityCandidate = parts[j].trim()
        // Skip if it looks like a street address (starts with number or contains "Road", "Street", etc.)
        if (/^\d/.test(cityCandidate)) continue
        if (/\b(road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir)\b/i.test(cityCandidate)) continue
        // This is likely the city
        return `${cityCandidate}, ${state}`
      }
    }
    // Also check for "City ST" or "City ST ZIP" pattern within a single part
    const inlineMatch = part.match(/^([A-Za-z\s.'-]+)\s+([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/i)
    if (inlineMatch) {
      const city = inlineMatch[1].trim()
      const state = inlineMatch[2].toUpperCase()
      // Skip if city looks like a street
      if (!/^\d/.test(city) && !/\b(road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir)\b/i.test(city)) {
        return `${city}, ${state}`
      }
    }
  }

  // No state found - don't return partial data
  return null
}

/** Label stored on the workout row at post time (visible to every feed viewer). */
export function gymLabelFromWorkout(workout: Workout): string | null {
  const stored = workout.gym_display_label?.trim()
  if (!stored) return null
  // If stored label has full address format, clean it up
  return cleanupGymLabel(stored)
}

/** Clean up a gym label to short format (Name, City, State). */
export function cleanupGymLabel(label: string | null | undefined): string | null {
  if (!label) return null
  const trimmed = label.trim()
  if (!trimmed) return null

  // If it contains " · " it's likely "Name · Full Address" format
  if (trimmed.includes(' · ')) {
    const [name, address] = trimmed.split(' · ', 2)
    if (address) {
      const cityState = extractCityState(address)
      return cityState ? `${name.trim()}, ${cityState}` : name.trim()
    }
    return name.trim()
  }

  // Check if it already looks like "Name, City, State" format (3 parts, last is 2-letter state)
  const parts = trimmed.split(',').map((p) => p.trim())
  if (parts.length === 3) {
    const lastPart = parts[2]
    if (/^[A-Z]{2}$/i.test(lastPart)) {
      // Already in correct format
      return `${parts[0]}, ${parts[1]}, ${lastPart.toUpperCase()}`
    }
  }

  // If it contains multiple commas, try to extract city/state
  if (parts.length > 2) {
    // Find state abbreviation in the parts
    for (let i = parts.length - 1; i >= 0; i--) {
      const stateMatch = parts[i].match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/i)
      if (stateMatch && i > 0) {
        const state = stateMatch[1].toUpperCase()
        // Look backwards for city (skip street addresses)
        for (let j = i - 1; j >= 0; j--) {
          const cityCandidate = parts[j]
          if (/^\d/.test(cityCandidate)) continue
          if (/\b(road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|circle|cir)\b/i.test(cityCandidate)) continue
          // Found city, use first part as name
          return `${parts[0]}, ${cityCandidate}, ${state}`
        }
      }
    }
  }

  return trimmed
}

/** Resolve gym label from cache, optional name param, or `gyms` table. */
/** Check if label appears to have city/state (e.g., "Gym Name, City, ST") */
function hasFullLocation(label: string | null): boolean {
  if (!label) return false
  // Look for pattern: ends with ", XX" where XX is a 2-letter state
  return /,\s*[A-Z]{2}\s*$/i.test(label)
}

export async function fetchGymLabel(
  gymId: string,
  gymName?: string | null,
): Promise<string | null> {
  const cached = getRememberedGymLabel(gymId)
  const cleaned = cached ? cleanupGymLabel(cached) : null

  // If cached has full location (city, state), use it
  if (cleaned && hasFullLocation(cleaned)) {
    return cleaned
  }

  // Fetch from DB to get full address
  const { data, error } = await supabase
    .from('gyms')
    .select('name,address')
    .eq('id', gymId)
    .maybeSingle()
  if (!error && data) {
    const lbl = formatGymLabel(data.name, data.address)
    if (lbl) {
      rememberGymLabel(gymId, lbl)
      return lbl
    }
    // If address is null, at least return the name
    const nameFallback = data.name?.trim() || null
    if (nameFallback) rememberGymLabel(gymId, nameFallback)
    return nameFallback
  }

  // Return whatever we have as fallback
  if (cleaned) return cleaned
  const fallback = gymName?.trim() || null
  if (fallback) rememberGymLabel(gymId, fallback)
  return fallback
}

const WORKOUT_FEED_COLUMNS_FULL =
  'id,user_id,gym_id,gym_display_label,workout_date,created_at,caption,image_url,secondary_image_url,workout_type,visibility'

const WORKOUT_FEED_COLUMNS_GYM_ID =
  'id,user_id,gym_id,workout_date,created_at,caption,image_url,secondary_image_url,workout_type,visibility'

const WORKOUT_FEED_COLUMNS_MINIMAL =
  'id,user_id,workout_date,created_at,caption,image_url,secondary_image_url,workout_type,visibility'

async function fetchWorkoutsForFeed(
  filter: { column: 'user_id' | 'visibility'; values: string[] | string; since: string; maxRows: number },
): Promise<Workout[]> {
  const buildQuery = (columns: string) => {
    let q = supabase
      .from('workouts')
      .select(columns)
      .gte('workout_date', filter.since)
      .order('workout_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(filter.maxRows)
    if (filter.column === 'user_id') {
      const ids = filter.values as string[]
      if (!ids.length) return null
      q = q.in('user_id', ids)
    } else {
      q = q.eq('visibility', filter.values as string)
    }
    return q
  }

  // Try full columns first (gym_id + gym_display_label)
  const full = await buildQuery(WORKOUT_FEED_COLUMNS_FULL)
  if (!full) return []
  if (!full.error) return (full.data ?? []) as Workout[]

  // Fallback: gym_id only (no gym_display_label)
  const withGymId = await buildQuery(WORKOUT_FEED_COLUMNS_GYM_ID)
  if (withGymId && !withGymId.error) return (withGymId.data ?? []) as Workout[]

  // Final fallback: no gym columns at all
  const minimal = await buildQuery(WORKOUT_FEED_COLUMNS_MINIMAL)
  if (minimal && !minimal.error) return (minimal.data ?? []) as Workout[]

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[feed] workouts query failed:', full.error.message)
  }
  return []
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
    const { data: gymRows, error: gymError } = await supabase
      .from('gyms')
      .select('id,name,address')
      .in('id', gymIds)
    if (!gymError) {
      for (const row of gymRows ?? []) {
        const g = row as { id: string; name: string; address: string | null }
        gymMap.set(g.id, { name: g.name, address: g.address })
      }
    }
  }

  const items: FeedItem[] = workouts.map((workout) => {
    const p = profileMap.get(workout.user_id)
    const g = workout.gym_id ? gymMap.get(workout.gym_id) : undefined
    const joined = g ? formatGymLabel(g.name, g.address) : null
    const stored = gymLabelFromWorkout(workout)
    const cached = workout.gym_id ? cleanupGymLabel(getRememberedGymLabel(workout.gym_id)) : null

    // Prefer the most complete label (one with city/state)
    let gymLabel = joined ?? stored ?? cached
    if (gymLabel && !hasFullLocation(gymLabel)) {
      // Try to find a more complete version
      const candidates = [joined, stored, cached].filter(Boolean)
      for (const c of candidates) {
        if (c && hasFullLocation(c)) {
          gymLabel = c
          break
        }
      }
    }

    // Update cache if we have a better label
    if (workout.gym_id && gymLabel && hasFullLocation(gymLabel)) {
      rememberGymLabel(workout.gym_id, gymLabel)
    }

    return {
      workout,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      gym_label: gymLabel,
    }
  })

  try {
    await fillMissingGymLabels(items)
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[feed] fillMissingGymLabels failed:', e)
    }
  }

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

  const workouts = await fetchWorkoutsForFeed({
    column: 'user_id',
    values: authorIds,
    since,
    maxRows,
  })

  const items = await enrichWorkouts(workouts)
  try {
    const patched = await backfillOwnWorkoutGymDisplay(userId)
    for (const item of items) {
      const label = patched.get(item.workout.id)
      if (label) {
        item.gym_label = label
        item.workout = { ...item.workout, gym_display_label: label }
      }
    }
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[feed] backfillOwnWorkoutGymDisplay failed:', e)
    }
  }
  return items
}

/** Public workouts from all users (including you) for the last `daysBack` days, newest first. */
export async function getGlobalWorkouts(
  _currentUserId: string,
  daysBack = 30,
  maxRows = 500,
): Promise<FeedItem[]> {
  const since = minWorkoutDateForLastNDays(daysBack)

  const workouts = await fetchWorkoutsForFeed({
    column: 'visibility',
    values: 'public',
    since,
    maxRows,
  })

  return enrichWorkouts(workouts)
}

async function latestPresenceGymId(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('gym_presence')
      .select('gym_id')
      .eq('user_id', userId)
      .order('checked_in_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    return (data?.gym_id as string | undefined) ?? null
  } catch {
    return null
  }
}

/** Resolve labels for feed rows when batch gym join or cache omitted them, or when incomplete. */
export async function fillMissingGymLabels(items: FeedItem[]): Promise<void> {
  const gymIdsToFetch = new Set<string>()
  for (const item of items) {
    // Fetch if missing OR if label is incomplete (no city/state)
    if (!item.workout?.gym_id) continue
    if (!item.gym_label || !hasFullLocation(item.gym_label)) {
      gymIdsToFetch.add(item.workout.gym_id)
    }
  }

  if (!gymIdsToFetch.size) return

  const resolved = new Map<string, string>()
  await Promise.all(
    [...gymIdsToFetch].map(async (gymId) => {
      const label = await fetchGymLabel(gymId)
      if (label) resolved.set(gymId, label)
    }),
  )

  for (const item of items) {
    if (!item.workout?.gym_id) continue
    const label = resolved.get(item.workout.gym_id)
    // Only update if we got a better (more complete) label
    if (label && (!item.gym_label || (hasFullLocation(label) && !hasFullLocation(item.gym_label)))) {
      item.gym_label = label
    }
  }
}

/**
 * Persist gym name on the user's own workouts that have gym_id but no stored label
 * (e.g. posted before `gym_display_label` existed). Best-effort; requires DB migration.
 */
function isMissingGymDisplayLabelColumn(err: { message?: string }): boolean {
  const m = (err.message ?? '').toLowerCase()
  return (
    m.includes('gym_display_label') &&
    (m.includes('schema cache') ||
      m.includes('could not find') ||
      m.includes('does not exist') ||
      m.includes('column'))
  )
}

/** workout id → label for rows patched during backfill (apply to in-memory feed items). */
export async function backfillOwnWorkoutGymDisplay(userId: string): Promise<Map<string, string>> {
  const labelsByWorkoutId = new Map<string, string>()

  // Try to query with gym_id - if column doesn't exist, skip backfill entirely
  const { data: rows, error } = await supabase
    .from('workouts')
    .select('id,gym_id,workout_date')
    .eq('user_id', userId)
    .gte('workout_date', minWorkoutDateForLastNDays(7))
    .order('created_at', { ascending: false })
    .limit(30)

  // If gym_id column doesn't exist, backfill isn't possible - silently return
  if (error) {
    const msg = (error.message ?? '').toLowerCase()
    if (msg.includes('gym_id') || msg.includes('does not exist') || msg.includes('schema cache')) {
      return labelsByWorkoutId
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[feed] workout backfill query failed:', error.message)
    }
    return labelsByWorkoutId
  }
  if (!rows?.length) return labelsByWorkoutId

  const today = minWorkoutDateForLastNDays(0)
  const presenceGymId = await latestPresenceGymId(userId)

  for (const row of rows) {
    let gymId = (row.gym_id as string | null) ?? null
    if (!gymId && row.workout_date === today && presenceGymId) {
      gymId = presenceGymId
    }
    if (!gymId) continue

    const label = await fetchGymLabel(gymId)
    if (!label) continue

    const patch: { gym_display_label: string; gym_id?: string } = { gym_display_label: label }
    if (!row.gym_id && gymId) patch.gym_id = gymId

    const { error: updateErr } = await supabase
      .from('workouts')
      .update(patch)
      .eq('id', row.id)
      .eq('user_id', userId)

    if (updateErr) {
      if (isMissingGymDisplayLabelColumn(updateErr)) return labelsByWorkoutId
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (!/row-level security|permission denied/i.test(updateErr.message ?? '')) {
          console.warn('[feed] gym_display_label backfill skipped:', updateErr.message)
        }
      }
      labelsByWorkoutId.set(row.id as string, label)
      continue
    }

    labelsByWorkoutId.set(row.id as string, label)
  }

  return labelsByWorkoutId
}
