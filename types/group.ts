export type Group = {
  id: string
  name: string
  description: string | null
  avatar_url: string | null
  tags: string[]
  bio: string | null
  created_by: string
  is_public: boolean
  created_at: string
}

export type GroupMember = {
  id: string
  group_id: string
  user_id: string
  points: number
  joined_at: string
}

export type GroupMessage = {
  id: string
  group_id: string
  user_id: string
  message: string
  created_at: string
}

export type GroupMemberWithProfile = GroupMember & {
  display_name: string | null
  avatar_url: string | null
  workouts_count: number
}
