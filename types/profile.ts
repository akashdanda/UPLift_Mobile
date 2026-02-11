export type Profile = {
  id: string
  display_name: string | null
  full_name: string | null
  avatar_url: string | null
  workouts_count: number
  streak: number
  groups_count: number
  notifications_enabled: boolean
  created_at: string
  updated_at: string
}

export type ProfileUpdate = {
  display_name?: string | null
  full_name?: string | null
  avatar_url?: string | null
  notifications_enabled?: boolean
}
