export type Group = {
  id: string
  name: string
  description: string | null
  created_by: string
  is_public: boolean
  created_at: string
}

export type GroupMember = {
  id: string
  group_id: string
  user_id: string
  joined_at: string
}
