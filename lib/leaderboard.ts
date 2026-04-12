import { supabase } from '@/lib/supabase'

export type LeaderboardScope = 'global' | 'friends'

/**
 * Monthly leaderboard only (calendar month UTC, resets each month).
 * Must stay in sync with `get_monthly_leaderboard` in Supabase migrations.
 * Only workouts and new friends this month earn points (no groups or competitions).
 */
const POINTS = {
  perWorkout: 20,
  perFriend: 5,
} as const

export type LeaderboardRow = {
  id: string
  display_name: string | null
  avatar_url: string | null
  workouts_count: number
  streak: number
  /** Always 0 from RPC; kept for API compatibility. */
  competition_wins: number
  friends_count: number
  /** Always 0 from RPC; kept for API compatibility. */
  groups_count: number
  points: number
  rank: number
}

type RpcPayload = {
  rows: LeaderboardRow[] | null
  my_row: LeaderboardRow | null
}

function normalizeRow(r: Record<string, unknown>): LeaderboardRow {
  return {
    id: String(r.id),
    display_name: (r.display_name as string | null) ?? null,
    avatar_url: (r.avatar_url as string | null) ?? null,
    workouts_count: Number(r.workouts_count ?? 0),
    streak: Number(r.streak ?? 0),
    competition_wins: Number(r.competition_wins ?? 0),
    friends_count: Number(r.friends_count ?? 0),
    groups_count: Number(r.groups_count ?? 0),
    points: Number(r.points ?? 0),
    rank: Number(r.rank ?? 0),
  }
}

/** Fetch leaderboard for the current month (resets every month). Returns top N + current user's row. Uses a DB RPC so totals match on every device (RLS no longer hides rows from the aggregation). */
export async function getLeaderboard(
  limit = 50,
  currentUserId?: string,
  scope: LeaderboardScope = 'global',
  groupIdForScope?: string
): Promise<{ rows: LeaderboardRow[]; myRow?: LeaderboardRow }> {
  const { data, error } = await supabase.rpc('get_monthly_leaderboard', {
    p_limit: limit,
    p_scope: scope,
    p_current_user_id: currentUserId ?? null,
    p_group_id: groupIdForScope ?? null,
  })

  if (error) {
    console.error('get_monthly_leaderboard', error.message)
    return { rows: [] }
  }

  const payload = data as RpcPayload | null
  const rawRows = payload?.rows
  const normalized = Array.isArray(rawRows)
    ? rawRows.map((row) => normalizeRow(row as Record<string, unknown>))
    : []

  // Deduplicate if the RPC ever returns duplicate user rows
  const seen = new Set<string>()
  const rows = normalized.filter((r) => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  const myRow =
    payload?.my_row != null
      ? normalizeRow(payload.my_row as Record<string, unknown>)
      : undefined

  return { rows, myRow }
}

/** Current month label for UI (e.g. "February 2026") */
export function getCurrentMonthLabel(): string {
  const now = new Date()
  return now.toLocaleString('default', { month: 'long', year: 'numeric' })
}

export { POINTS as LEADERBOARD_POINTS }
