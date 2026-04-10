import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'

const LAST_VIEWED_KEY = 'notifications_last_viewed'

export type NotificationType =
  | 'reaction'
  | 'comment'
  | 'friend_streak'
  | 'friend_activity'
  | 'duel_update'

export type Notification = {
  id: string
  type: NotificationType
  created_at: string
  // Reaction/comment notifications
  actor_id?: string
  actor_display_name?: string
  actor_avatar_url?: string | null
  workout_id?: string
  workout_image_url?: string | null
  emoji?: string
  comment_text?: string
  // Friend streak notifications
  friend_id?: string
  friend_display_name?: string
  friend_avatar_url?: string | null
  streak_count?: number
  // Friend activity notifications
  activity_type?: string
  activity_description?: string
  // Duel / challenge notifications
  duel_id?: string
  duel_status?: string
  duel_opponent_name?: string | null
  duel_type?: string
}

/**
 * Get all notifications for a user
 */
export async function getNotifications(userId: string, limit = 50): Promise<Notification[]> {
  const notifications: Notification[] = []

  // 1. Reactions on user's workouts (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  const { data: userWorkouts } = await supabase
    .from('workouts')
    .select('id, image_url')
    .eq('user_id', userId)
    .gte('workout_date', sevenDaysAgo.toISOString().split('T')[0])

  if (userWorkouts && userWorkouts.length > 0) {
    const workoutIds = userWorkouts.map((w) => w.id)
    const workoutMap = new Map(userWorkouts.map((w) => [w.id, w]))

    const { data: reactions } = await supabase
      .from('workout_reactions')
      .select('id, workout_id, user_id, emoji, created_at')
      .in('workout_id', workoutIds)
      .neq('user_id', userId) // Exclude own reactions
      .gte('created_at', sevenDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (reactions && reactions.length > 0) {
      const userIds = [...new Set(reactions.map((r) => r.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

      const profileMap = new Map(
        (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [
          p.id,
          p,
        ])
      )

      for (const r of reactions) {
        const workout = workoutMap.get(r.workout_id)
        const profile = profileMap.get(r.user_id)
        notifications.push({
          id: `reaction_${r.id}`,
          type: 'reaction',
          created_at: r.created_at,
          actor_id: r.user_id,
          actor_display_name: profile?.display_name ?? null,
          actor_avatar_url: profile?.avatar_url ?? null,
          workout_id: r.workout_id,
          workout_image_url: workout?.image_url ?? null,
          emoji: r.emoji,
        })
      }
    }
  }

  // 2. Comments on user's workouts (last 7 days)
  if (userWorkouts && userWorkouts.length > 0) {
    const workoutIds = userWorkouts.map((w) => w.id)

    const { data: comments } = await supabase
      .from('workout_comments')
      .select('id, workout_id, user_id, message, created_at')
      .in('workout_id', workoutIds)
      .neq('user_id', userId) // Exclude own comments
      .gte('created_at', sevenDaysAgoStr)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (comments && comments.length > 0) {
      const userIds = [...new Set(comments.map((c) => c.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

      const profileMap = new Map(
        (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [
          p.id,
          p,
        ])
      )

      for (const c of comments) {
        const profile = profileMap.get(c.user_id)
        notifications.push({
          id: `comment_${c.id}`,
          type: 'comment',
          created_at: c.created_at,
          actor_id: c.user_id,
          actor_display_name: profile?.display_name ?? null,
          actor_avatar_url: profile?.avatar_url ?? null,
          workout_id: c.workout_id,
          comment_text: c.message ?? null,
        })
      }
    }
  }

  // 3. Friend streaks (friends who hit milestones today)
  const today = new Date().toISOString().split('T')[0]
  const { data: friendships } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')

  const friends: Array<{ id: string; display_name: string | null; avatar_url: string | null; streak: number }> = []
  if (friendships && friendships.length > 0) {
    const friendIds = friendships.map((f) => f.friend_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, streak')
      .in('id', friendIds)

    if (profiles) {
      friends.push(...(profiles as any))
    }
  }

  for (const friendProfile of friends) {
    const streak = friendProfile?.streak ?? 0
    // Notify on streak milestones (7, 14, 30, 50, 100, etc.)
    if (streak > 0 && [7, 14, 30, 50, 100, 200, 365].includes(streak)) {
      // Check if they worked out today
      const { data: todayWorkout } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', friendProfile.id)
        .eq('workout_date', today)
        .limit(1)
        .maybeSingle()

      if (todayWorkout) {
        notifications.push({
          id: `streak_${friendProfile.id}_${streak}`,
          type: 'friend_streak',
          created_at: new Date().toISOString(),
          friend_id: friendProfile.id,
          friend_display_name: friendProfile.display_name ?? null,
          friend_avatar_url: friendProfile.avatar_url ?? null,
          streak_count: streak,
        })
      }
    }
  }

  // 4. Recent duel / challenge updates involving the user (last 7 days)
  const { data: duels } = await supabase
    .from('duels')
    .select('*')
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .gte('updated_at', sevenDaysAgoStr)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (duels && duels.length > 0) {
    const participantIds = new Set<string>()
    for (const d of duels as any[]) {
      participantIds.add(d.challenger_id)
      participantIds.add(d.opponent_id)
    }

    const { data: duelProfiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', [...participantIds])

    const duelProfileMap = new Map(
      (duelProfiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p])
    )

    for (const d of duels as any[]) {
      const iAmChallenger = d.challenger_id === userId
      const opponentId = iAmChallenger ? d.opponent_id : d.challenger_id
      const opponent = duelProfileMap.get(opponentId)
      notifications.push({
        id: `duel_${d.id}_${d.updated_at}`,
        type: 'duel_update',
        created_at: d.updated_at,
        duel_id: d.id,
        duel_status: d.status,
        duel_type: d.type,
        duel_opponent_name: opponent?.display_name ?? null,
      })
    }
  }

  // 5. Friend activity incentives (friends who worked out today)
  if (friends.length > 0) {
    const friendIds = friends.map((f) => f.id).filter(Boolean)

    if (friendIds.length > 0) {
      const { data: todayFriendWorkouts } = await supabase
        .from('workouts')
        .select('user_id')
        .in('user_id', friendIds)
        .eq('workout_date', today)
        .order('created_at', { ascending: false })

      if (todayFriendWorkouts) {
        const seenFriends = new Set<string>()
        const workoutUserIds = [...new Set(todayFriendWorkouts.map((w) => w.user_id))]
        const friendMap = new Map(friends.map((f) => [f.id, f]))

        for (const friendId of workoutUserIds) {
          if (!seenFriends.has(friendId)) {
            seenFriends.add(friendId)
            const friend = friendMap.get(friendId)
            if (friend) {
              notifications.push({
                id: `activity_${friendId}_${today}`,
                type: 'friend_activity',
                created_at: new Date().toISOString(),
                friend_id: friendId,
                friend_display_name: friend.display_name ?? null,
                friend_avatar_url: friend.avatar_url ?? null,
                activity_type: 'workout',
                activity_description: 'worked out today',
              })
            }
          }
        }
      }
    }
  }

  // Sort by created_at descending and limit
  return notifications
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

/**
 * Get the last viewed timestamp for notifications
 */
export async function getLastViewedTimestamp(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_VIEWED_KEY)
  } catch {
    return null
  }
}

/**
 * Mark notifications as read (save current timestamp)
 */
export async function markNotificationsAsRead(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_VIEWED_KEY, new Date().toISOString())
  } catch {
    // Ignore errors
  }
}

/**
 * Get unread notification count (only notifications created after last viewed)
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const lastViewed = await getLastViewedTimestamp()
  const notifications = await getNotifications(userId, 100)

  if (!lastViewed) {
    // If never viewed, all are unread
    return notifications.length
  }

  const lastViewedTime = new Date(lastViewed).getTime()
  return notifications.filter((n) => new Date(n.created_at).getTime() > lastViewedTime).length
}
