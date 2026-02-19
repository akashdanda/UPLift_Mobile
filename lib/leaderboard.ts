import { getFriends } from '@/lib/friends'
import { getGroupMemberIds, getGroupPeerIds } from '@/lib/groups'
import { supabase } from '@/lib/supabase'

export type LeaderboardScope = 'global' | 'friends' | 'groups'

/** Weights for unified points (adjust to tune leaderboard) */
const POINTS = {
  workout: 10,
  streakMultiplier: 2, // Each streak day multiplies points by 2
  competitionWin: 20,
} as const

export type LeaderboardRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  workouts_count: number
  streak: number
  competition_wins: number
  points: number
  rank: number
}

function computePoints(row: {
  workouts_count: number
  streak: number
  competition_wins: number
}): number {
  // Base points from workouts and competition wins
  const basePoints =
    (row.workouts_count ?? 0) * POINTS.workout +
    (row.competition_wins ?? 0) * POINTS.competitionWin

  // Apply streak multiplier: each streak day = 2x multiplier (exponential)
  // 0 streak = 1x, 1 streak = 2x, 2 streak = 4x, 3 streak = 8x, etc.
  const streakMultiplier = row.streak > 0 ? Math.pow(POINTS.streakMultiplier, row.streak) : 1

  return Math.round(basePoints * streakMultiplier)
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

/** Consecutive days with workouts counting back from today (capped to the month). */
function computeStreak(workoutDates: string[], _dateEnd: string): number {
  const set = new Set(workoutDates)
  if (set.size === 0) return 0

  // Start from today (UTC) — not from end-of-month which may be in the future
  const now = new Date()
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  const startFrom = todayStr < _dateEnd ? todayStr : _dateEnd

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startFrom)
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
  currentUserId?: string,
  scope: LeaderboardScope = 'global',
  groupIdForScope?: string
): Promise<{ rows: LeaderboardRow[]; myRow?: LeaderboardRow }> {
  const { dateStart, dateEnd, tsStart, tsEnd } = getMonthBounds()

  let allowedIds: Set<string> | null = null
  if (scope === 'friends' && currentUserId) {
    const friends = await getFriends(currentUserId)
    allowedIds = new Set([currentUserId, ...friends.map((f) => f.id)])
  } else if (scope === 'groups') {
    if (groupIdForScope) {
      const memberIds = await getGroupMemberIds(groupIdForScope)
      allowedIds = memberIds.length ? new Set(memberIds) : new Set()
    } else if (currentUserId) {
      const peerIds = await getGroupPeerIds(currentUserId)
      allowedIds = new Set(peerIds)
    }
  }

  // Fetch workouts this month + completed competitions with winners
  const [workoutsRes, competitionsRes] = await Promise.all([
    supabase
      .from('workouts')
      .select('user_id, workout_date')
      .gte('workout_date', dateStart)
      .lte('workout_date', dateEnd),
    supabase
      .from('group_competitions')
      .select('group1_id, group2_id, winner_group_id')
      .eq('status', 'completed')
      .not('winner_group_id', 'is', null),
  ])

  // For competition wins, we need to map winning group → member user_ids
  const winningGroupIds = new Set<string>()
  ;(competitionsRes.data ?? []).forEach((c: any) => {
    if (c.winner_group_id) winningGroupIds.add(c.winner_group_id)
  })

  // Fetch members of winning groups
  let winsByUser = new Map<string, number>()
  if (winningGroupIds.size > 0) {
    const { data: winMembers } = await supabase
      .from('group_members')
      .select('user_id, group_id')
      .in('group_id', [...winningGroupIds])

    // Count wins per user (a user could be in multiple winning groups)
    const groupWinCount = new Map<string, number>()
    ;(competitionsRes.data ?? []).forEach((c: any) => {
      if (c.winner_group_id) {
        groupWinCount.set(c.winner_group_id, (groupWinCount.get(c.winner_group_id) ?? 0) + 1)
      }
    })

    ;(winMembers ?? []).forEach((m: { user_id: string; group_id: string }) => {
      const groupWins = groupWinCount.get(m.group_id) ?? 0
      if (groupWins > 0) {
        winsByUser.set(m.user_id, (winsByUser.get(m.user_id) ?? 0) + groupWins)
      }
    })
  }

  type Agg = { workouts: string[]; competition_wins: number }
  const agg = new Map<string, Agg>()

  const ensure = (userId: string) => {
    if (!agg.has(userId)) agg.set(userId, { workouts: [], competition_wins: 0 })
    return agg.get(userId)!
  }

  ;(workoutsRes.data ?? []).forEach((r: { user_id: string; workout_date: string }) => {
    const a = ensure(r.user_id)
    if (!a.workouts.includes(r.workout_date)) a.workouts.push(r.workout_date)
  })

  // Add competition wins
  winsByUser.forEach((wins, userId) => {
    ensure(userId).competition_wins = wins
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
    const competition_wins = a.competition_wins
    return {
      id,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      workouts_count,
      streak,
      competition_wins,
      points: computePoints({ workouts_count, streak, competition_wins }),
    }
  })

  rows.sort((a, b) => b.points - a.points)
  let ranked = rows.map((r, i) => ({ ...r, rank: i + 1 })) as LeaderboardRow[]
  if (allowedIds?.size) {
    ranked = ranked.filter((r) => allowedIds!.has(r.id))
    ranked = ranked.map((r, i) => ({ ...r, rank: i + 1 }))
  }
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
