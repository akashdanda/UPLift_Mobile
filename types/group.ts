export type Group = {
  id: string
  name: string
  description: string | null
  avatar_url: string | null
  tags: string[]
  location: string | null
  created_by: string
  is_public: boolean
  created_at: string
}

export type GroupRole = 'owner' | 'admin' | 'member'

export type GroupMember = {
  id: string
  group_id: string
  user_id: string
  points: number
  role: GroupRole
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

export type CompetitionType = 'matchmaking' | 'challenge'
export type CompetitionStatus = 'pending' | 'active' | 'completed' | 'cancelled'

export type GroupCompetition = {
  id: string
  group1_id: string
  group2_id: string
  type: CompetitionType
  status: CompetitionStatus
  started_at: string | null
  ends_at: string
  group1_score: number
  group2_score: number
  winner_group_id: string | null
  created_by: string
  created_at: string
}

export type CompetitionWithGroups = GroupCompetition & {
  group1: Pick<Group, 'id' | 'name' | 'avatar_url'>
  group2: Pick<Group, 'id' | 'name' | 'avatar_url'>
}

export type CompetitionContribution = {
  id: string
  competition_id: string
  user_id: string
  group_id: string
  points: number
  workouts_count: number
  created_at: string
  updated_at: string
}

export type CompetitionContributionWithProfile = CompetitionContribution & {
  display_name: string | null
  avatar_url: string | null
}
