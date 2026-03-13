import { getFriends } from '@/lib/friends'
import { getGroupMemberIds, getGroupPeerIds } from '@/lib/groups'
import { supabase } from '@/lib/supabase'

export type LeaderboardScope = 'global' | 'friends' | 'groups'

/** Point system: each friend +2, each group +1, each workout +5, competition win +20, workout missed -2, every 10 streak +50 */
const POINTS = {
  perFriend: 2,
  perGroup: 1,
  perWorkout: 5,
  perCompetitionWin: 20,
  perWorkoutMissed: -2,
  perStreakTier: 50,
} as const

function streakBonus(streak: number): number {
  return Math.floor((streak ?? 0) / 10) * POINTS.perStreakTier
}

export type LeaderboardRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  workouts_count: number
  streak: number
  competition_wins: number
  friends_count: number
  groups_count: number
  points: number
  rank: number
}

function computePoints(row: {
  workouts_count: number
  streak: number
  competition_wins: number
  friends_count: number
  groups_count: number
  workouts_missed?: number
}): number {
  const friends = row.friends_count ?? 0
  const groups = row.groups_count ?? 0
  const workouts = row.workouts_count ?? 0
  const wins = row.competition_wins ?? 0
  const missed = row.workouts_missed ?? 0
  const streak = row.streak ?? 0
  return (
    friends * POINTS.perFriend +
    groups * POINTS.perGroup +
    workouts * POINTS.perWorkout +
    wins * POINTS.perCompetitionWin +
    missed * POINTS.perWorkoutMissed +
    streakBonus(streak)
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
    .select('id, display_name, avatar_url, friends_count, groups_count, streak')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null; friends_count?: number; groups_count?: number; streak?: number }) => [p.id, p])
  )

  const rows: Omit<LeaderboardRow, 'rank'>[] = userIds.map((id) => {
    const a = agg.get(id)!
    const profile = profileMap.get(id) as {
      id: string
      display_name: string | null
      avatar_url: string | null
      friends_count?: number
      groups_count?: number
      streak?: number
    } | undefined
    const workouts_count = a.workouts.length
    const streak = profile?.streak ?? 0
    const competition_wins = a.competition_wins
    const friends_count = profile?.friends_count ?? 0
    const groups_count = profile?.groups_count ?? 0
    return {
      id,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      workouts_count,
      streak,
      competition_wins,
      friends_count,
      groups_count,
      points: computePoints({
        workouts_count,
        streak,
        competition_wins,
        friends_count,
        groups_count,
      }),
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
