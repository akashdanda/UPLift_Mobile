import { getFriends } from '@/lib/friends'
import { supabase } from '@/lib/supabase'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
export type BuddySuggestion = {
  id: string
  display_name: string | null
  avatar_url: string | null
  workouts_count: number
  streak: number
  /** Why this match was suggested */
  reason: string
  /** Match score (higher = better match) */
  score: number
}

// ──────────────────────────────────────────────
// Workout type keywords (extracted from captions)
// ──────────────────────────────────────────────
const WORKOUT_TYPE_KEYWORDS: Record<string, string[]> = {
  gym: ['gym', 'weight', 'lifting', 'weights', 'bench', 'squat', 'deadlift', 'barbell', 'dumbbell'],
  running: ['run', 'running', 'jog', 'jogging', 'sprint', 'marathon', '5k', '10k', 'track'],
  cycling: ['bike', 'cycling', 'bicycle', 'spin', 'peloton'],
  yoga: ['yoga', 'stretch', 'stretching', 'meditation', 'pilates'],
  cardio: ['cardio', 'treadmill', 'elliptical', 'rower', 'rowing'],
  strength: ['strength', 'powerlifting', 'bodybuilding', 'muscle'],
  hiit: ['hiit', 'high intensity', 'circuit', 'tabata', 'interval'],
  swimming: ['swim', 'swimming', 'pool', 'aqua'],
  boxing: ['boxing', 'punch', 'punching', 'mma', 'martial arts'],
  outdoor: ['hike', 'hiking', 'trail', 'outdoor', 'park', 'nature'],
  crossfit: ['crossfit', 'wod', 'box'],
  dance: ['dance', 'dancing', 'zumba'],
}

// ──────────────────────────────────────────────
// Extract workout types from caption text
// ──────────────────────────────────────────────
function extractWorkoutTypes(caption: string | null): Set<string> {
  const types = new Set<string>()
  if (!caption) return types
  const lower = caption.toLowerCase()
  for (const [type, keywords] of Object.entries(WORKOUT_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      types.add(type)
    }
  }
  return types
}

// ──────────────────────────────────────────────
// Analyze posting activity patterns
// ──────────────────────────────────────────────
type ActivityPattern = {
  workoutTypes: Set<string>
  postingHours: number[] // hours of day (0-23) when workouts are posted
  postingDays: Set<number> // days of week (0-6)
  groupTags: Set<string>
}

async function analyzeUserActivity(userId: string): Promise<ActivityPattern> {
  // Get recent workouts (last 8 weeks for better pattern analysis)
  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
  const eightWeeksAgoStr = `${eightWeeksAgo.getFullYear()}-${String(eightWeeksAgo.getMonth() + 1).padStart(2, '0')}-${String(eightWeeksAgo.getDate()).padStart(2, '0')}`

  const { data: workouts } = await supabase
    .from('workouts')
    .select('caption, created_at')
    .eq('user_id', userId)
    .gte('workout_date', eightWeeksAgoStr)
    .order('created_at', { ascending: false })
    .limit(50)

  const workoutTypes = new Set<string>()
  const postingHours: number[] = []
  const postingDays = new Set<number>()

  for (const w of (workouts ?? []) as Array<{ caption: string | null; created_at: string }>) {
    // Extract workout types
    const types = extractWorkoutTypes(w.caption)
    types.forEach((t) => workoutTypes.add(t))

    // Analyze posting time
    const createdAt = new Date(w.created_at)
    postingHours.push(createdAt.getHours())
    postingDays.add(createdAt.getDay())
  }

  // Get user's groups and their tags
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)

  const groupTags = new Set<string>()
  if (memberships?.length) {
    const groupIds = memberships.map((m) => m.group_id)
    const { data: groups } = await supabase
      .from('groups')
      .select('tags')
      .in('id', groupIds)

    for (const g of (groups ?? []) as Array<{ tags: string[] | null }>) {
      if (g.tags) {
        g.tags.forEach((tag) => groupTags.add(tag.toLowerCase()))
      }
    }
  }

  return { workoutTypes, postingHours, postingDays, groupTags }
}

// ──────────────────────────────────────────────
// Calculate similarity score between two activity patterns
// ──────────────────────────────────────────────
function calculateSimilarity(
  myPattern: ActivityPattern,
  theirPattern: ActivityPattern
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // Workout type overlap (high weight - most important)
  const typeIntersection = new Set([...myPattern.workoutTypes].filter((t) => theirPattern.workoutTypes.has(t)))
  const typeUnion = new Set([...myPattern.workoutTypes, ...theirPattern.workoutTypes])
  const typeSimilarity = typeUnion.size > 0 ? typeIntersection.size / typeUnion.size : 0

  if (typeSimilarity > 0.5) {
    score += 50
    const types = Array.from(typeIntersection).slice(0, 2).join(', ')
    reasons.push(`Similar workouts: ${types}`)
  } else if (typeSimilarity > 0.25) {
    score += 30
    reasons.push('Some similar workout types')
  } else if (typeIntersection.size > 0) {
    score += 15
    reasons.push('Shares some workout interests')
  }

  // Posting time similarity (same time of day)
  if (myPattern.postingHours.length > 0 && theirPattern.postingHours.length > 0) {
    const myAvgHour =
      myPattern.postingHours.reduce((a, b) => a + b, 0) / myPattern.postingHours.length
    const theirAvgHour =
      theirPattern.postingHours.reduce((a, b) => a + b, 0) / theirPattern.postingHours.length
    const hourDiff = Math.abs(myAvgHour - theirAvgHour)

    if (hourDiff <= 2) {
      score += 25
      const timeOfDay =
        myAvgHour < 12 ? 'morning' : myAvgHour < 17 ? 'afternoon' : myAvgHour < 21 ? 'evening' : 'night'
      reasons.push(`Both post in the ${timeOfDay}`)
    } else if (hourDiff <= 4) {
      score += 12
      reasons.push('Similar posting times')
    }
  }

  // Day-of-week pattern similarity
  const dayIntersection = new Set([...myPattern.postingDays].filter((d) => theirPattern.postingDays.has(d)))
  if (dayIntersection.size >= 3) {
    score += 20
    reasons.push('Similar workout schedule')
  } else if (dayIntersection.size >= 2) {
    score += 10
    reasons.push('Some schedule overlap')
  }

  // Group tag overlap
  const tagIntersection = new Set([...myPattern.groupTags].filter((t) => theirPattern.groupTags.has(t)))
  if (tagIntersection.size >= 2) {
    score += 20
    const tags = Array.from(tagIntersection).slice(0, 2).join(', ')
    reasons.push(`Similar interests: ${tags}`)
  } else if (tagIntersection.size >= 1) {
    score += 10
    reasons.push('Shared interests')
  }

  return { score, reasons }
}

// ──────────────────────────────────────────────
// Matching logic — pairs users with similar workout types, posting activity, and group tags
// ──────────────────────────────────────────────
export async function getBuddySuggestions(
  userId: string,
  limit = 5
): Promise<BuddySuggestion[]> {
  // Get current user profile
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('id, workouts_count, streak')
    .eq('id', userId)
    .single()

  if (!myProfile) return []

  // Get existing friend IDs to exclude
  const friends = await getFriends(userId)
  const friendIds = new Set(friends.map((f) => f.id))
  friendIds.add(userId) // exclude self

  // Analyze current user's activity pattern
  const myPattern = await analyzeUserActivity(userId)

  // Get candidate users (must have at least a few workouts to analyze)
  const { data: candidates } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, workouts_count, streak')
    .gte('workouts_count', 3) // Need at least 3 workouts to analyze patterns
    .neq('id', userId)
    .limit(100) // Get more candidates for better matching

  if (!candidates?.length) return []

  // Analyze and score each candidate
  const suggestions: BuddySuggestion[] = []

  for (const c of candidates as Array<{
    id: string
    display_name: string | null
    avatar_url: string | null
    workouts_count: number
    streak: number
  }>) {
    if (friendIds.has(c.id)) continue

    // Analyze candidate's activity pattern
    const theirPattern = await analyzeUserActivity(c.id)

    // Calculate similarity
    const { score, reasons } = calculateSimilarity(myPattern, theirPattern)

    // Add bonus for active users (streak)
    let finalScore = score
    if (c.streak > 0) {
      finalScore += 5
    }

    // Add small bonus for similar volume (secondary factor)
    const myCount = myProfile.workouts_count ?? 0
    const volumeDiff = Math.abs((c.workouts_count ?? 0) - myCount)
    if (volumeDiff <= 10) {
      finalScore += 5
    }

    const reason = reasons.length > 0 ? reasons[0] : 'Recommended for you'

    suggestions.push({
      id: c.id,
      display_name: c.display_name,
      avatar_url: c.avatar_url,
      workouts_count: c.workouts_count ?? 0,
      streak: c.streak ?? 0,
      reason,
      score: finalScore,
    })
  }

  // Sort by score descending, take top N
  suggestions.sort((a, b) => b.score - a.score)
  return suggestions.slice(0, limit)
}
