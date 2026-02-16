import { supabase } from '@/lib/supabase'
import type {
  Achievement,
  AchievementFeedPost,
  UserAchievement,
  UserAchievementWithDetails,
} from '@/types/achievement'

// ──────────────────────────────────────────────
// Fetch all achievement definitions
// ──────────────────────────────────────────────
export async function getAllAchievements(): Promise<Achievement[]> {
  const { data } = await supabase
    .from('achievements')
    .select('*')
    .order('sort_order', { ascending: true })
  return (data ?? []) as Achievement[]
}

// ──────────────────────────────────────────────
// Fetch a user's achievement progress
// ──────────────────────────────────────────────
export async function getUserAchievements(
  userId: string
): Promise<UserAchievementWithDetails[]> {
  const { data } = await supabase
    .from('user_achievements')
    .select(
      `
      *,
      achievement:achievements(*)
    `
    )
    .eq('user_id', userId)

  if (!data) return []

  return data.map((row: any) => ({
    ...row,
    ...(row.achievement ?? {}),
    achievement_id: row.achievement_id,
  })) as UserAchievementWithDetails[]
}

// ──────────────────────────────────────────────
// Get top 2 unlocked achievements for display on leaderboard
// ──────────────────────────────────────────────
export async function getTopBadges(
  userId: string,
  limit = 2
): Promise<Array<{ icon: string; name: string }>> {
  const { data } = await supabase
    .from('user_achievements')
    .select(
      `
      achievement:achievements(icon, name)
    `
    )
    .eq('user_id', userId)
    .eq('unlocked', true)
    .order('unlocked_at', { ascending: false })
    .limit(limit)

  if (!data) return []
  return data.map((row: any) => ({
    icon: row.achievement?.icon ?? '🏅',
    name: row.achievement?.name ?? '',
  }))
}

// ──────────────────────────────────────────────
// Batch-fetch top badges for a list of user IDs (for leaderboard)
// ──────────────────────────────────────────────
export async function getBatchTopBadges(
  userIds: string[],
  limit = 2
): Promise<Map<string, Array<{ icon: string; name: string }>>> {
  if (userIds.length === 0) return new Map()

  const { data } = await supabase
    .from('user_achievements')
    .select(
      `
      user_id,
      unlocked_at,
      achievement:achievements(icon, name, sort_order)
    `
    )
    .in('user_id', userIds)
    .eq('unlocked', true)
    .order('unlocked_at', { ascending: false })

  const map = new Map<string, Array<{ icon: string; name: string }>>()
  if (!data) return map

  for (const row of data as any[]) {
    const uid = row.user_id as string
    if (!map.has(uid)) map.set(uid, [])
    const arr = map.get(uid)!
    if (arr.length < limit) {
      arr.push({
        icon: row.achievement?.icon ?? '🏅',
        name: row.achievement?.name ?? '',
      })
    }
  }
  return map
}

// ──────────────────────────────────────────────
// Check + update achievements for a user
// Returns newly unlocked achievements
// ──────────────────────────────────────────────
export async function checkAndUpdateAchievements(
  userId: string
): Promise<UserAchievementWithDetails[]> {
  // 1. Get all achievements + user stats
  const [achievements, profile, existingRows] = await Promise.all([
    getAllAchievements(),
    supabase.from('profiles').select('*').eq('id', userId).single().then(r => r.data),
    supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .then(r => (r.data ?? []) as UserAchievement[]),
  ])

  if (!profile) return []

  // Get social stats
  const [reactionsRes, commentsRes] = await Promise.all([
    supabase
      .from('workout_reactions')
      .select('id', { count: 'exact', head: true })
      .in(
        'workout_id',
        (await supabase.from('workouts').select('id').eq('user_id', userId)).data?.map(
          (w: any) => w.id
        ) ?? []
      ),
    supabase
      .from('workout_comments')
      .select('id', { count: 'exact', head: true })
      .neq('user_id', userId)
      .in(
        'workout_id',
        (await supabase.from('workouts').select('id').eq('user_id', userId)).data?.map(
          (w: any) => w.id
        ) ?? []
      ),
  ])

  const stats = {
    streak: profile.streak ?? 0,
    workouts_count: profile.workouts_count ?? 0,
    friends_count: profile.friends_count ?? 0,
    reactions_received: reactionsRes.count ?? 0,
    comments_received: commentsRes.count ?? 0,
  }

  const existingMap = new Map(existingRows.map(r => [r.achievement_id, r]))
  const newlyUnlocked: UserAchievementWithDetails[] = []

  for (const ach of achievements) {
    // Compute progress
    let progress = 0
    switch (ach.requirement_type) {
      case 'streak':
        progress = stats.streak
        break
      case 'workouts_count':
        progress = stats.workouts_count
        break
      case 'friends_count':
        progress = stats.friends_count
        break
      case 'reactions_received':
        progress = stats.reactions_received
        break
      case 'comments_received':
        progress = stats.comments_received
        break
      // competitive + goals types are handled separately
      default:
        continue
    }

    const existing = existingMap.get(ach.id)
    const isUnlocked = progress >= ach.requirement_value
    const wasAlreadyUnlocked = existing?.unlocked ?? false

    if (existing) {
      // Update progress
      if (existing.progress_value !== progress || (isUnlocked && !wasAlreadyUnlocked)) {
        await supabase
          .from('user_achievements')
          .update({
            progress_value: progress,
            unlocked: isUnlocked || wasAlreadyUnlocked,
            unlocked_at:
              isUnlocked && !wasAlreadyUnlocked
                ? new Date().toISOString()
                : existing.unlocked_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      }
    } else {
      // Insert new
      await supabase.from('user_achievements').insert({
        user_id: userId,
        achievement_id: ach.id,
        progress_value: progress,
        unlocked: isUnlocked,
        unlocked_at: isUnlocked ? new Date().toISOString() : null,
        notified: false,
      })
    }

    if (isUnlocked && !wasAlreadyUnlocked) {
      newlyUnlocked.push({
        ...ach,
        id: existing?.id ?? '',
        user_id: userId,
        achievement_id: ach.id,
        progress_value: progress,
        unlocked: true,
        unlocked_at: new Date().toISOString(),
        notified: false,
      })
    }
  }

  return newlyUnlocked
}

// ──────────────────────────────────────────────
// Mark achievement as notified (celebration shown)
// ──────────────────────────────────────────────
export async function markAchievementNotified(
  userId: string,
  achievementId: string
): Promise<void> {
  await supabase
    .from('user_achievements')
    .update({ notified: true })
    .eq('user_id', userId)
    .eq('achievement_id', achievementId)
}

// ──────────────────────────────────────────────
// Get un-notified unlocked achievements (for celebration queue)
// ──────────────────────────────────────────────
export async function getUnnotifiedAchievements(
  userId: string
): Promise<UserAchievementWithDetails[]> {
  const { data } = await supabase
    .from('user_achievements')
    .select(
      `
      *,
      achievement:achievements(*)
    `
    )
    .eq('user_id', userId)
    .eq('unlocked', true)
    .eq('notified', false)

  if (!data) return []

  return data.map((row: any) => ({
    ...row,
    ...(row.achievement ?? {}),
    achievement_id: row.achievement_id,
  })) as UserAchievementWithDetails[]
}

// ──────────────────────────────────────────────
// Create auto-feed announcement post
// ──────────────────────────────────────────────
export async function createAchievementFeedPost(
  userId: string,
  achievementId: string,
  message: string
): Promise<void> {
  await supabase.from('achievement_feed_posts').insert({
    user_id: userId,
    achievement_id: achievementId,
    message,
  })
}

// ──────────────────────────────────────────────
// Get recent achievement feed posts (for friends)
// ──────────────────────────────────────────────
export async function getAchievementFeedPosts(
  userIds: string[],
  limit = 20
): Promise<AchievementFeedPost[]> {
  if (userIds.length === 0) return []

  const { data } = await supabase
    .from('achievement_feed_posts')
    .select(
      `
      *,
      profile:profiles!achievement_feed_posts_user_id_fkey(display_name, avatar_url),
      achievement:achievements(name, icon)
    `
    )
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  return data.map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    achievement_id: row.achievement_id,
    message: row.message,
    created_at: row.created_at,
    display_name: row.profile?.display_name ?? null,
    avatar_url: row.profile?.avatar_url ?? null,
    achievement_name: row.achievement?.name ?? null,
    achievement_icon: row.achievement?.icon ?? null,
  }))
}

// ──────────────────────────────────────────────
// Streak freeze helpers
// ──────────────────────────────────────────────
export async function hasStreakFreezeAvailable(userId: string): Promise<boolean> {
  const { data } = await supabase.rpc('has_streak_freeze_available', {
    p_user_id: userId,
  })
  return data === true
}

export async function useStreakFreeze(userId: string): Promise<boolean> {
  const { data } = await supabase.rpc('use_streak_freeze', {
    p_user_id: userId,
  })
  return data === true
}

// ──────────────────────────────────────────────
// Leaderboard snapshot helpers
// ──────────────────────────────────────────────
export async function saveLeaderboardSnapshot(
  userId: string,
  scope: string,
  rank: number,
  points: number,
  period: string
): Promise<void> {
  await supabase
    .from('leaderboard_snapshots')
    .upsert(
      { user_id: userId, scope, rank, points, period },
      { onConflict: 'user_id,scope,period' }
    )
}

export async function getPreviousSnapshot(
  userId: string,
  scope: string,
  period: string
): Promise<{ rank: number; points: number } | null> {
  const { data } = await supabase
    .from('leaderboard_snapshots')
    .select('rank, points')
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('period', period)
    .maybeSingle()
  return data as { rank: number; points: number } | null
}
