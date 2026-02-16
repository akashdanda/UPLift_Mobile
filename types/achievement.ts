// ──────────────────────────────────────────────
// Achievement types
// ──────────────────────────────────────────────

export type AchievementCategory = 'consistency' | 'volume' | 'competitive' | 'social' | 'goals'

export type Achievement = {
  id: string
  key: string
  name: string
  description: string
  category: AchievementCategory
  icon: string
  requirement_type: string
  requirement_value: number
  sort_order: number
}

export type UserAchievement = {
  id: string
  user_id: string
  achievement_id: string
  progress_value: number
  unlocked: boolean
  unlocked_at: string | null
  notified: boolean
}

export type UserAchievementWithDetails = UserAchievement & Achievement

export type AchievementFeedPost = {
  id: string
  user_id: string
  achievement_id: string
  message: string
  created_at: string
  // Joined fields
  display_name?: string | null
  avatar_url?: string | null
  achievement_name?: string | null
  achievement_icon?: string | null
}

export type StreakFreeze = {
  id: string
  user_id: string
  used_at: string
  month_year: string
}

export type LeaderboardSnapshot = {
  id: string
  user_id: string
  scope: string
  rank: number
  points: number
  period: string
}

/** Category metadata for display grouping */
export const ACHIEVEMENT_CATEGORIES: Record<
  AchievementCategory,
  { label: string; icon: string; color: string }
> = {
  consistency: { label: 'Consistency', icon: '🔥', color: '#EF4444' },
  volume: { label: 'Volume', icon: '💪', color: '#3B82F6' },
  competitive: { label: 'Competitive', icon: '🏆', color: '#EAB308' },
  social: { label: 'Social', icon: '👥', color: '#8B5CF6' },
  goals: { label: 'Goals', icon: '🎯', color: '#10B981' },
}
