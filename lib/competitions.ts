import { getMemberRole } from '@/lib/groups'
import { supabase } from '@/lib/supabase'
import type {
  CompetitionContributionWithProfile,
  CompetitionWithGroups,
  GroupCompetition
} from '@/types/group'
export type {
  CompetitionContributionWithProfile,
  CompetitionWithGroups,
  GroupCompetition
} from '@/types/group'

/** Queue a group for matchmaking */
export async function queueForMatchmaking(
  groupId: string,
  userId: string
): Promise<{ error: Error | null }> {
  // Check if already queued
  const { data: existing } = await supabase
    .from('group_matchmaking_queue')
    .select('id')
    .eq('group_id', groupId)
    .single()

  if (existing) {
    return { error: new Error('Group is already in matchmaking queue') }
  }

  // Check if group has active competition
  const { data: active } = await supabase
    .from('group_competitions')
    .select('id')
    .or(`group1_id.eq.${groupId},group2_id.eq.${groupId}`)
    .eq('status', 'active')
    .single()

  if (active) {
    return { error: new Error('Group already has an active competition') }
  }

  const { error } = await supabase.from('group_matchmaking_queue').insert({
    group_id: groupId,
    queued_by: userId,
  })

  if (error) return { error }

  // Try to match immediately
  await supabase.rpc('match_groups_in_queue')

  return { error: null }
}

/** Remove group from matchmaking queue */
export async function leaveMatchmakingQueue(
  groupId: string,
  userId: string
): Promise<{ error: Error | null }> {
  // Verify user is owner or admin
  const role = await getMemberRole(groupId, userId)
  if (!role || role === 'member') {
    return { error: new Error('Only owner or admin can leave queue') }
  }

  const { error } = await supabase
    .from('group_matchmaking_queue')
    .delete()
    .eq('group_id', groupId)

  return { error: error ?? null }
}

/** Check if group is in matchmaking queue */
export async function isInMatchmakingQueue(groupId: string): Promise<boolean> {
  const { data } = await supabase
    .from('group_matchmaking_queue')
    .select('id')
    .eq('group_id', groupId)
    .single()

  return !!data
}

/** Challenge another group directly */
export async function challengeGroup(
  challengerGroupId: string,
  targetGroupId: string,
  userId: string,
  durationDays: number = 7
): Promise<{ competition: GroupCompetition | null; error: Error | null }> {
  // Verify user is owner or admin of challenger group
  const challengerRole = await getMemberRole(challengerGroupId, userId)
  if (!challengerRole || challengerRole === 'member') {
    return { competition: null, error: new Error('Only owner or admin can challenge') }
  }

  // Check if either group has active competition
  const { data: active } = await supabase
    .from('group_competitions')
    .select('id')
    .or(`group1_id.eq.${challengerGroupId},group2_id.eq.${challengerGroupId},group1_id.eq.${targetGroupId},group2_id.eq.${targetGroupId}`)
    .eq('status', 'active')
    .maybeSingle()

  if (active) {
    return { competition: null, error: new Error('One or both groups already have an active competition') }
  }

  // Check for existing pending challenge
  const { data: existing } = await supabase
    .from('group_competitions')
    .select('id')
    .or(`and(group1_id.eq.${challengerGroupId},group2_id.eq.${targetGroupId}),and(group1_id.eq.${targetGroupId},group2_id.eq.${challengerGroupId})`)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return { competition: null, error: new Error('Challenge already exists') }
  }

  const endsAt = new Date()
  endsAt.setDate(endsAt.getDate() + durationDays)

  const { data, error } = await supabase
    .from('group_competitions')
    .insert({
      group1_id: challengerGroupId,
      group2_id: targetGroupId,
      type: 'challenge',
      status: 'pending',
      ends_at: endsAt.toISOString(),
      created_by: userId,
    })
    .select()
    .single()

  if (error) return { competition: null, error }
  return { competition: data as GroupCompetition, error: null }
}

/** Accept a pending challenge */
export async function acceptChallenge(
  competitionId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { data: competition } = await supabase
    .from('group_competitions')
    .select('group2_id, status')
    .eq('id', competitionId)
    .single()

  if (!competition) {
    return { error: new Error('Competition not found') }
  }

  if (competition.status !== 'pending') {
    return { error: new Error('Competition is not pending') }
  }

  // Verify user is owner or admin of group2
  const role = await getMemberRole(competition.group2_id, userId)
  if (!role || role === 'member') {
    return { error: new Error('Only owner or admin can accept challenge') }
  }

  const { error } = await supabase
    .from('group_competitions')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .eq('id', competitionId)

  return { error: error ?? null }
}

/** Decline/cancel a pending challenge */
export async function cancelChallenge(
  competitionId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { data: competition } = await supabase
    .from('group_competitions')
    .select('group1_id, group2_id, status')
    .eq('id', competitionId)
    .single()

  if (!competition) {
    return { error: new Error('Competition not found') }
  }

  // Verify user is owner or admin of either group
  const role1 = await getMemberRole(competition.group1_id, userId)
  const role2 = await getMemberRole(competition.group2_id, userId)

  const hasPermission =
    (role1 && role1 !== 'member') ||
    (role2 && role2 !== 'member')

  if (!hasPermission) {
    return { error: new Error('Only owner or admin can cancel challenge') }
  }

  const { error } = await supabase
    .from('group_competitions')
    .update({ status: 'cancelled' })
    .eq('id', competitionId)

  return { error: error ?? null }
}

/** Get active competitions for a group */
export async function getActiveCompetitions(groupId: string): Promise<CompetitionWithGroups[]> {
  const { data } = await supabase
    .from('group_competitions')
    .select(
      `
      *,
      group1:groups!group_competitions_group1_id_fkey(id, name, avatar_url),
      group2:groups!group_competitions_group2_id_fkey(id, name, avatar_url)
    `
    )
    .or(`group1_id.eq.${groupId},group2_id.eq.${groupId}`)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((row: any) => ({
    ...row,
    group1: row.group1,
    group2: row.group2,
  })) as CompetitionWithGroups[]
}

/** Get completed competitions for a group */
export async function getCompletedCompetitions(
  groupId: string,
  limit: number = 10
): Promise<CompetitionWithGroups[]> {
  const { data } = await supabase
    .from('group_competitions')
    .select(
      `
      *,
      group1:groups!group_competitions_group1_id_fkey(id, name, avatar_url),
      group2:groups!group_competitions_group2_id_fkey(id, name, avatar_url)
    `
    )
    .or(`group1_id.eq.${groupId},group2_id.eq.${groupId}`)
    .eq('status', 'completed')
    .order('ends_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  return data.map((row: any) => ({
    ...row,
    group1: row.group1,
    group2: row.group2,
  })) as CompetitionWithGroups[]
}

/** Get competition details with contributions */
export async function getCompetitionDetails(
  competitionId: string
): Promise<{
  competition: CompetitionWithGroups | null
  contributions: CompetitionContributionWithProfile[]
  error: Error | null
}> {
  const { data: competition, error: compError } = await supabase
    .from('group_competitions')
    .select(
      `
      *,
      group1:groups!group_competitions_group1_id_fkey(id, name, avatar_url),
      group2:groups!group_competitions_group2_id_fkey(id, name, avatar_url)
    `
    )
    .eq('id', competitionId)
    .single()

  if (compError || !competition) {
    return { competition: null, contributions: [], error: compError as Error }
  }

  // Fetch raw contributions (no profile join — we get profiles from group members)
  const { data: contributions } = await supabase
    .from('competition_member_contributions')
    .select('*')
    .eq('competition_id', competitionId)
    .order('points', { ascending: false })

  const rawContribs = contributions ?? []

  // Fetch display names for contributors
  const userIds = [...new Set(rawContribs.map((c: any) => c.user_id))]
  let profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>()

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds)

    for (const p of profiles ?? []) {
      profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url })
    }
  }

  const contributionsWithProfile: CompetitionContributionWithProfile[] =
    rawContribs.map((c: any) => ({
      ...c,
      display_name: profileMap.get(c.user_id)?.display_name ?? null,
      avatar_url: profileMap.get(c.user_id)?.avatar_url ?? null,
    }))

  return {
    competition: competition as CompetitionWithGroups,
    contributions: contributionsWithProfile,
    error: null,
  }
}

/** Get groups available to challenge (public groups, not in active competition, not own group) */
export async function getChallengeableGroups(
  myGroupId: string,
  userId: string
): Promise<Array<{ id: string; name: string; avatar_url: string | null; member_count: number }>> {
  // Get groups user is NOT in and that are public
  const { data: myMemberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)

  const myGroupIds = new Set((myMemberships ?? []).map((m) => m.group_id))
  myGroupIds.add(myGroupId)

  // Get groups with active competitions
  const { data: activeComps } = await supabase
    .from('group_competitions')
    .select('group1_id, group2_id')
    .eq('status', 'active')

  const groupsInActiveComps = new Set<string>()
  activeComps?.forEach((comp) => {
    groupsInActiveComps.add(comp.group1_id)
    groupsInActiveComps.add(comp.group2_id)
  })

  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, avatar_url')
    .eq('is_public', true)
    .neq('id', myGroupId)

  if (!groups) return []

  // Filter and get member counts
  const available = groups.filter(
    (g) => !myGroupIds.has(g.id) && !groupsInActiveComps.has(g.id)
  )

  const memberCounts = await Promise.all(
    available.map(async (g) => {
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id)
      return { ...g, member_count: count ?? 0 }
    })
  )

  return memberCounts
}
