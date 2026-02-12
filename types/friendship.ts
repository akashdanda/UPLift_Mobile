export type FriendshipStatus = 'pending' | 'accepted'

export type Friendship = {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
}

export type ProfilePublic = {
  id: string
  display_name: string | null
  avatar_url: string | null
  workouts_count: number
}
