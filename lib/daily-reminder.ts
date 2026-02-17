import { getFriends } from '@/lib/friends'
import { supabase } from '@/lib/supabase'

export type DailyReminderInfo = {
  hasPostedToday: boolean
  friendsPostedTodayCount: number
  /** Hours until end of local day (midnight). Null if already past or no relevance. */
  hoursLeftUntilCutoff: number | null
}

/** Local today as YYYY-MM-DD (for consistency with rest of app). */
export function getTodayLocalDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Hours left until midnight tonight (local time). Returns 0 if already past midnight. */
export function getHoursLeftUntilMidnight(): number {
  const now = new Date()
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  const msLeft = tonight.getTime() - now.getTime()
  if (msLeft <= 0) return 0
  return Math.floor(msLeft / (60 * 60 * 1000))
}

/**
 * Data for the daily post reminder: has user posted today, how many friends posted today,
 * and hours left until midnight. Used for in-app banner and (later) push copy.
 */
export async function getDailyReminderInfo(userId: string): Promise<DailyReminderInfo> {
  const today = getTodayLocalDate()

  const [userWorkoutRes, friends] = await Promise.all([
    supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .eq('workout_date', today)
      .maybeSingle(),
    getFriends(userId),
  ])

  const hasPostedToday = !!userWorkoutRes.data

  const friendIds = friends.map((f) => f.id)
  let friendsPostedTodayCount = 0
  if (friendIds.length > 0) {
    const { data: friendWorkouts } = await supabase
      .from('workouts')
      .select('user_id')
      .in('user_id', friendIds)
      .eq('workout_date', today)
    const distinctUsers = new Set((friendWorkouts ?? []).map((r: { user_id: string }) => r.user_id))
    friendsPostedTodayCount = distinctUsers.size
  }

  const hoursLeft = getHoursLeftUntilMidnight()

  return {
    hasPostedToday,
    friendsPostedTodayCount,
    hoursLeftUntilCutoff: hoursLeft > 0 ? hoursLeft : null,
  }
}

/**
 * Returns the suggested reminder message for the current state.
 * Priority: urgency (≤3 hours left) > friends nudge > default daily.
 */
export function getReminderMessage(info: DailyReminderInfo): string {
  if (info.hasPostedToday) return ''
  if (info.hoursLeftUntilCutoff !== null && info.hoursLeftUntilCutoff <= 3) {
    const h = info.hoursLeftUntilCutoff
    if (h <= 1) return "1 hour left to post today. Don't fall behind."
    return `${h} hours left to post today. Don't fall behind.`
  }
  if (info.friendsPostedTodayCount >= 1) {
    const n = info.friendsPostedTodayCount
    const verb = n === 1 ? 'has' : 'have'
    const word = n === 1 ? 'workout' : 'workouts'
    return `${n} of your friends ${verb} already logged their ${word} today. Don't fall behind.`
  }
  return 'Post daily — log a workout to keep your streak.'
}
