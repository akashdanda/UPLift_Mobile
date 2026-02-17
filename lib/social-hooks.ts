import { getFriends } from '@/lib/friends'
import { supabase } from '@/lib/supabase'

// ──────────────────────────────────────────────
// Social hook types
// ──────────────────────────────────────────────

export type FriendActivitySummary = {
  /** Number of friends who worked out today */
  friendsWorkedOutToday: number
  /** Names of up to 3 friends who worked out today */
  friendNames: string[]
  /** Total friends */
  totalFriends: number
}

export type StreakLeader = {
  id: string
  display_name: string | null
  avatar_url: string | null
  streak: number
}

export type SocialNudge = {
  type: 'friends_active' | 'streak_leader' | 'behind_friends' | 'level_up_close'
  title: string
  message: string
  emoji: string
}

// ──────────────────────────────────────────────
// Fetch friend activity summary for today
// ──────────────────────────────────────────────
function getTodayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function getFriendActivitySummary(
  userId: string
): Promise<FriendActivitySummary> {
  const friends = await getFriends(userId)
  if (friends.length === 0) {
    return { friendsWorkedOutToday: 0, friendNames: [], totalFriends: 0 }
  }

  const friendIds = friends.map((f) => f.id)
  const today = getTodayDate()

  const { data: workouts } = await supabase
    .from('workouts')
    .select('user_id')
    .in('user_id', friendIds)
    .eq('workout_date', today)

  const workedOutIds = new Set((workouts ?? []).map((w: { user_id: string }) => w.user_id))

  // Map IDs to display names
  const friendMap = new Map(friends.map((f) => [f.id, f.display_name ?? 'Someone']))
  const activeNames: string[] = []
  for (const id of workedOutIds) {
    activeNames.push(friendMap.get(id) ?? 'Someone')
    if (activeNames.length >= 3) break
  }

  return {
    friendsWorkedOutToday: workedOutIds.size,
    friendNames: activeNames,
    totalFriends: friends.length,
  }
}

// ──────────────────────────────────────────────
// Get top streak leaders among friends
// ──────────────────────────────────────────────
export async function getStreakLeaders(
  userId: string,
  limit = 3
): Promise<StreakLeader[]> {
  const friends = await getFriends(userId)
  if (friends.length === 0) return []

  const friendIds = friends.map((f) => f.id)

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, streak')
    .in('id', friendIds)
    .gt('streak', 0)
    .order('streak', { ascending: false })
    .limit(limit)

  return (data ?? []) as StreakLeader[]
}

// ──────────────────────────────────────────────
// Build social nudges for the home feed
// ──────────────────────────────────────────────
export async function getSocialNudges(
  userId: string,
  userStreak: number,
  userXP: number,
  xpToNext: number,
  hasLoggedToday: boolean
): Promise<SocialNudge[]> {
  const nudges: SocialNudge[] = []

  const [activity, streakLeaders] = await Promise.all([
    getFriendActivitySummary(userId),
    getStreakLeaders(userId, 1),
  ])

  // "X friends worked out today"
  if (activity.friendsWorkedOutToday > 0) {
    const nameStr =
      activity.friendNames.length <= 2
        ? activity.friendNames.join(' and ')
        : `${activity.friendNames.slice(0, 2).join(', ')} and ${activity.friendsWorkedOutToday - 2} more`

    nudges.push({
      type: 'friends_active',
      title: `${activity.friendsWorkedOutToday} friend${activity.friendsWorkedOutToday > 1 ? 's' : ''} worked out today`,
      message: nameStr,
      emoji: '💪',
    })
  }

  // "Haven't worked out but friends have"
  if (!hasLoggedToday && activity.friendsWorkedOutToday > 0) {
    nudges.push({
      type: 'behind_friends',
      title: "Don't fall behind!",
      message: `${activity.friendsWorkedOutToday} of your friends already worked out today.`,
      emoji: '⏰',
    })
  }

  // Streak leader spotlight
  if (streakLeaders.length > 0 && streakLeaders[0].streak > userStreak) {
    const leader = streakLeaders[0]
    nudges.push({
      type: 'streak_leader',
      title: `${leader.display_name ?? 'A friend'} is on fire!`,
      message: `${leader.streak}-day streak — can you catch up?`,
      emoji: '🔥',
    })
  }

  // Close to leveling up
  if (xpToNext > 0 && xpToNext <= 50) {
    nudges.push({
      type: 'level_up_close',
      title: 'Almost there!',
      message: `You're only ${xpToNext} XP away from the next rank.`,
      emoji: '⬆️',
    })
  }

  return nudges
}
