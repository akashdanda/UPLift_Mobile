import { supabase } from '@/lib/supabase'

/** Weights for unified points (adjust to tune leaderboard) */
const POINTS = {
  workout: 10,
  streak: 15,
  group: 5,
  friend: 3,
} as const

export type LeaderboardRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  workouts_count: number
  streak: number
  groups_count: number
  friends_count: number
  points: number
  rank: number
}

function computePoints(row: {
  workouts_count: number
  streak: number
  groups_count: number
  friends_count: number
}): number {
  return (
    (row.workouts_count ?? 0) * POINTS.workout +
    (row.streak ?? 0) * POINTS.streak +
    (row.groups_count ?? 0) * POINTS.group +
    (row.friends_count ?? 0) * POINTS.friend
  )
}

/** Current month bounds in UTC (YYYY-MM-DD and ISO timestamps) */
function getMonthBounds() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999))
  return {
    dateStart: start.toISOString().slice(0, 10),
    dateEnd: end.toISOString().slice(0, 10),
    tsStart: start.toISOString(),
    tsEnd: end.toISOString(),
  }
}

/** Consecutive days with workouts in the month ending at refDate. Uses date parts to avoid Date bounds issues. */
function computeStreak(workoutDates: string[], dateEnd: string): number {
  const set = new Set(workoutDates)
  if (set.size === 0) return 0
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateEnd)
  if (!match) return 0
  let y = parseInt(match[1], 10)
  let m = parseInt(match[2], 10) - 1
  let day = parseInt(match[3], 10)
  const endMonth = m
  let streak = 0
  while (true) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!set.has(key)) break
    streak++
    day--
    if (day < 1) {
      m--
      if (m < 0) {
        m = 11
        y--
      }
      day = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    }
    if (m !== endMonth) break
  }
  return streak
}

/** Fetch leaderboard for the current month (resets every month). Returns top 50 + current user's row if not in top. */
export async function getLeaderboard(
  limit = 50,
  currentUserId?: string
): Promise<{ rows: LeaderboardRow[]; myRow?: LeaderboardRow }> {
  const { dateStart, dateEnd, tsStart, tsEnd } = getMonthBounds()

  const [workoutsRes, groupMembersRes, friendshipsRes] = await Promise.all([
    supabase
      .from('workouts')
      .select('user_id, workout_date')
      .gte('workout_date', dateStart)
      .lte('workout_date', dateEnd),
    supabase
      .from('group_members')
      .select('user_id')
      .gte('joined_at', tsStart)
      .lte('joined_at', tsEnd),
    supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .not('accepted_at', 'is', null)
      .gte('accepted_at', tsStart)
      .lte('accepted_at', tsEnd),
  ])

  type Agg = { workouts: string[]; groups: number; friends: number }
  const agg = new Map<string, Agg>()

  const ensure = (userId: string) => {
    if (!agg.has(userId)) agg.set(userId, { workouts: [], groups: 0, friends: 0 })
    return agg.get(userId)!
  }

  ;(workoutsRes.data ?? []).forEach((r: { user_id: string; workout_date: string }) => {
    const a = ensure(r.user_id)
    if (!a.workouts.includes(r.workout_date)) a.workouts.push(r.workout_date)
  })

  ;(groupMembersRes.data ?? []).forEach((r: { user_id: string }) => {
    ensure(r.user_id).groups++
  })

  ;(friendshipsRes.data ?? []).forEach((r: { requester_id: string; addressee_id: string }) => {
    ensure(r.requester_id).friends++
    ensure(r.addressee_id).friends++
  })

  const userIds = [...agg.keys()]
  if (userIds.length === 0) return { rows: [] }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p: { id: string }) => [p.id, p]))

  const rows: Omit<LeaderboardRow, 'rank'>[] = userIds.map((id) => {
    const a = agg.get(id)!
    const profile = profileMap.get(id) as { id: string; display_name: string | null; avatar_url: string | null } | undefined
    const workouts_count = a.workouts.length
    const streak = computeStreak(a.workouts, dateEnd)
    const groups_count = a.groups
    const friends_count = a.friends
    return {
      id,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      workouts_count,
      streak,
      groups_count,
      friends_count,
      points: computePoints({ workouts_count, streak, groups_count, friends_count }),
    }
  })

  rows.sort((a, b) => b.points - a.points)
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 })) as LeaderboardRow[]
  const top = ranked.slice(0, limit)

  const myRow = currentUserId ? ranked.find((r) => r.id === currentUserId) : undefined
  return { rows: top, myRow }
}

/** Current month label for UI (e.g. "February 2026") */
export function getCurrentMonthLabel(): string {
  const now = new Date()
  return now.toLocaleString('default', { month: 'long', year: 'numeric' })
}

export { POINTS as LEADERBOARD_POINTS }
