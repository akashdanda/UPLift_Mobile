import { supabase } from '@/lib/supabase'
import { LEVEL_TIERS, type LevelDefinition, type UserLevel } from '@/types/level'
import type { Profile } from '@/types/profile'

// ──────────────────────────────────────────────
// Point system (unified for levels and leaderboard)
// ──────────────────────────────────────────────
export const POINTS = {
  perFriend: 2,
  perWorkout: 5,
  perCompetitionWin: 20,
  perWorkoutMissed: -2,
  perStreakTier: 50, // every 10 streak: +50 (10→50, 20→100, 30→150, …)
} as const

/** Streak bonus: +50 for every full 10 streak (10→50, 20→100, 30→150, …) */
function streakBonus(streak: number): number {
  return Math.floor((streak ?? 0) / 10) * POINTS.perStreakTier
}

// ──────────────────────────────────────────────
// Compute total points from profile + competition wins + optional missed count
// ──────────────────────────────────────────────
export function computePoints(
  profile: Pick<Profile, 'workouts_count' | 'streak' | 'groups_count'> & {
    friends_count?: number
  },
  competitionWins: number,
  workoutsMissed = 0
): number {
  const friends = profile.friends_count ?? 0
  const workouts = profile.workouts_count ?? 0
  const streak = profile.streak ?? 0
  return (
    friends * POINTS.perFriend +
    workouts * POINTS.perWorkout +
    competitionWins * POINTS.perCompetitionWin +
    workoutsMissed * POINTS.perWorkoutMissed +
    streakBonus(streak)
  )
}

/** @deprecated Use computePoints for the new system. Kept for compatibility; maps to same scale. */
export function computeXP(
  profile: Pick<Profile, 'workouts_count' | 'streak' | 'groups_count'> & {
    friends_count?: number
  },
  _unusedAchievements: number,
  competitionWins = 0,
  workoutsMissed = 0
): number {
  return computePoints(profile, competitionWins, workoutsMissed)
}

/** Fetch total competition wins (completed, user in winning group) for one user */
export async function getCompetitionWinsCount(userId: string): Promise<number> {
  const { data: members } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
  const groupIds = (members ?? []).map((m: { group_id: string }) => m.group_id)
  if (groupIds.length === 0) return 0
  const { count } = await supabase
    .from('group_competitions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .not('winner_group_id', 'is', null)
    .in('winner_group_id', groupIds)
  return count ?? 0
}

/** Batch-fetch total competition wins for many users */
export async function getBatchCompetitionWins(
  userIds: string[]
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map()
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, group_id')
    .in('user_id', userIds)
  const winsByUser = new Map<string, number>()
  for (const id of userIds) winsByUser.set(id, 0)
  const groupIdsByUser = new Map<string, string[]>()
  for (const m of (members ?? []) as Array<{ user_id: string; group_id: string }>) {
    const list = groupIdsByUser.get(m.user_id) ?? []
    list.push(m.group_id)
    groupIdsByUser.set(m.user_id, list)
  }
  const allGroupIds = [...new Set((members ?? []).map((m: { group_id: string }) => m.group_id))]
  if (allGroupIds.length === 0) return winsByUser
  const { data: comps } = await supabase
    .from('group_competitions')
    .select('winner_group_id')
    .eq('status', 'completed')
    .not('winner_group_id', 'is', null)
    .in('winner_group_id', allGroupIds)
  const winCountByGroup = new Map<string, number>()
  for (const c of (comps ?? []) as Array<{ winner_group_id: string }>) {
    winCountByGroup.set(
      c.winner_group_id,
      (winCountByGroup.get(c.winner_group_id) ?? 0) + 1
    )
  }
  for (const [uid, gids] of groupIdsByUser) {
    let total = 0
    for (const gid of gids) total += winCountByGroup.get(gid) ?? 0
    winsByUser.set(uid, total)
  }
  return winsByUser
}

// ──────────────────────────────────────────────
// Derive the current level from XP
// ──────────────────────────────────────────────
export function getLevelFromXP(xp: number): UserLevel {
  let current: LevelDefinition = LEVEL_TIERS[0]
  let nextIdx = 1

  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_TIERS[i].minXP) {
      current = LEVEL_TIERS[i]
      nextIdx = i + 1
      break
    }
  }

  const next = nextIdx < LEVEL_TIERS.length ? LEVEL_TIERS[nextIdx] : null
  const xpIntoLevel = xp - current.minXP
  const xpSpan = next ? next.minXP - current.minXP : 1
  const progress = next ? Math.min(xpIntoLevel / xpSpan, 1) : 1
  const xpToNext = next ? next.minXP - xp : 0

  return {
    level: current,
    xp,
    nextLevel: next,
    progress,
    xpToNext,
  }
}

// ──────────────────────────────────────────────
// Get a user's level (fetches profile + competition wins; workouts_missed not in DB yet, use 0)
// ──────────────────────────────────────────────
export async function getUserLevel(userId: string): Promise<UserLevel> {
  const [profileRes, competitionWins] = await Promise.all([
    supabase.from('profiles').select('workouts_count, streak, groups_count, friends_count').eq('id', userId).single(),
    getCompetitionWinsCount(userId),
  ])

  const profile = profileRes.data ?? {
    workouts_count: 0,
    streak: 0,
    groups_count: 0,
    friends_count: 0,
  }
  const points = computePoints(profile as any, competitionWins, 0)
  return getLevelFromXP(points)
}

// ──────────────────────────────────────────────
// Batch-fetch levels for a list of user IDs (for leaderboard)
// ──────────────────────────────────────────────
export async function getBatchUserLevels(
  userIds: string[]
): Promise<Map<string, UserLevel>> {
  if (userIds.length === 0) return new Map()

  const [profilesRes, winsMap] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, workouts_count, streak, groups_count, friends_count')
      .in('id', userIds),
    getBatchCompetitionWins(userIds),
  ])

  const profiles = (profilesRes.data ?? []) as Array<{
    id: string
    workouts_count: number
    streak: number
    groups_count: number
    friends_count: number
  }>

  const map = new Map<string, UserLevel>()
  for (const p of profiles) {
    const points = computePoints(p, winsMap.get(p.id) ?? 0, 0)
    map.set(p.id, getLevelFromXP(points))
  }
  return map
}
