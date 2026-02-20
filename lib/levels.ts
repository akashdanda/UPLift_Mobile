import { supabase } from '@/lib/supabase'
import { LEVEL_TIERS, type LevelDefinition, type UserLevel } from '@/types/level'
import type { Profile } from '@/types/profile'

// ──────────────────────────────────────────────
// XP weights — tune these to balance progression
// ──────────────────────────────────────────────
const XP_WEIGHTS = {
  workout: 2500,
  streak: 3750,
  group: 1250,
  friend: 750,
  achievementUnlocked: 6250,
} as const

// ──────────────────────────────────────────────
// Compute XP from a profile + achievement count
// ──────────────────────────────────────────────
export function computeXP(
  profile: Pick<Profile, 'workouts_count' | 'streak' | 'groups_count'> & {
    friends_count?: number
  },
  unlockedAchievements: number
): number {
  return (
    (profile.workouts_count ?? 0) * XP_WEIGHTS.workout +
    (profile.streak ?? 0) * XP_WEIGHTS.streak +
    (profile.groups_count ?? 0) * XP_WEIGHTS.group +
    (profile.friends_count ?? 0) * XP_WEIGHTS.friend +
    unlockedAchievements * XP_WEIGHTS.achievementUnlocked
  )
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
// Get a user's level (fetches achievement count from DB)
// ──────────────────────────────────────────────
export async function getUserLevel(userId: string): Promise<UserLevel> {
  const [profileRes, achievementRes] = await Promise.all([
    supabase.from('profiles').select('workouts_count, streak, groups_count, friends_count').eq('id', userId).single(),
    supabase
      .from('user_achievements')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('unlocked', true),
  ])

  const profile = profileRes.data ?? {
    workouts_count: 0,
    streak: 0,
    groups_count: 0,
    friends_count: 0,
  }
  const unlockedCount = achievementRes.count ?? 0

  const xp = computeXP(profile as any, unlockedCount)
  return getLevelFromXP(xp)
}

// ──────────────────────────────────────────────
// Batch-fetch levels for a list of user IDs (for leaderboard)
// ──────────────────────────────────────────────
export async function getBatchUserLevels(
  userIds: string[]
): Promise<Map<string, UserLevel>> {
  if (userIds.length === 0) return new Map()

  const [profilesRes, achievementsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, workouts_count, streak, groups_count, friends_count')
      .in('id', userIds),
    supabase
      .from('user_achievements')
      .select('user_id')
      .in('user_id', userIds)
      .eq('unlocked', true),
  ])

  const profiles = (profilesRes.data ?? []) as Array<{
    id: string
    workouts_count: number
    streak: number
    groups_count: number
    friends_count: number
  }>

  // Count unlocked achievements per user
  const achCountMap = new Map<string, number>()
  for (const row of (achievementsRes.data ?? []) as Array<{ user_id: string }>) {
    achCountMap.set(row.user_id, (achCountMap.get(row.user_id) ?? 0) + 1)
  }

  const map = new Map<string, UserLevel>()
  for (const p of profiles) {
    const xp = computeXP(p, achCountMap.get(p.id) ?? 0)
    map.set(p.id, getLevelFromXP(xp))
  }
  return map
}
