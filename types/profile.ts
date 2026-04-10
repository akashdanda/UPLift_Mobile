export type Profile = {
  id: string
  display_name: string | null
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  workouts_count: number
  streak: number
  /** Longest consecutive workout streak ever (all time). */
  longest_streak?: number
  groups_count: number
  friends_count?: number // added for leaderboard; run run-leaderboard-friends-count-in-dashboard.sql
  notifications_enabled: boolean
  /** Expo push token for sending push notifications (set when user grants permission). */
  expo_push_token?: string | null
  display_name_changed_at: string | null
  /** E.164 when set; used only for contact matching (not shown on public profile cards). */
  phone_e164?: string | null
  /** When true, others can find this user by matching a saved phone with synced contacts. */
  discoverable_by_phone?: boolean
  /** When true, this user's presence is visible to others at the gym. */
  location_visible?: boolean
  created_at: string
  updated_at: string
}

export type ProfileUpdate = {
  display_name?: string | null
  full_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  notifications_enabled?: boolean
  expo_push_token?: string | null
  phone_e164?: string | null
  discoverable_by_phone?: boolean
  location_visible?: boolean
}
