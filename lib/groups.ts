import { supabase } from '@/lib/supabase'
import type { Group, GroupMemberWithProfile, GroupMessage } from '@/types/group'

export type { GroupMemberWithProfile, GroupMessage }

export type GroupWithMeta = Group & { member_count?: number }

/** User IDs that share at least one group with the given user (including the user) */
export async function getGroupPeerIds(userId: string): Promise<string[]> {
  const { data: myMemberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
  if (!myMemberships?.length) return [userId]
  const groupIds = myMemberships.map((m) => m.group_id)
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .in('group_id', groupIds)
  const ids = [...new Set((members ?? []).map((m) => m.user_id))]
  return ids.length ? ids : [userId]
}

/** User IDs in a specific group (members of that group) */
export async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
  const ids = [...new Set((members ?? []).map((m) => m.user_id))]
  return ids
}

/** Groups the user is a member of */
export async function getMyGroups(userId: string): Promise<GroupWithMeta[]> {
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
  if (!memberships?.length) return []
  const groupIds = memberships.map((m) => m.group_id)
  const { data: groups } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .order('created_at', { ascending: false })
  if (!groups?.length) return []
  const counts = await Promise.all(
    (groups as Group[]).map(async (g) => {
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id)
      return count ?? 0
    })
  )
  return (groups as Group[]).map((g, i) => ({ ...g, member_count: counts[i] })) as GroupWithMeta[]
}

/** Public groups the user is NOT already in (for discover) */
export async function getDiscoverGroups(userId: string, limit = 20): Promise<GroupWithMeta[]> {
  const { data: myMemberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
  const joinedIds = new Set((myMemberships ?? []).map((m) => m.group_id))
  const { data: groups } = await supabase
    .from('groups')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit * 2)
  const notJoined = (groups ?? []).filter((g) => !joinedIds.has(g.id)).slice(0, limit) as Group[]
  if (!notJoined.length) return []
  const counts = await Promise.all(
    notJoined.map(async (g) => {
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id)
      return count ?? 0
    })
  )
  return notJoined.map((g, i) => ({ ...g, member_count: counts[i] })) as GroupWithMeta[]
}

/** Create a group and add the creator as first member */
export async function createGroup(
  userId: string,
  name: string,
  description: string | null,
  bio: string | null = null,
  tags: string[] = [],
  avatarUrl: string | null = null,
  isPublic: boolean = true
): Promise<{ group: Group; error: Error | null }> {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      bio: bio?.trim() || null,
      tags: tags.length > 0 ? tags : [],
      avatar_url: avatarUrl,
      created_by: userId,
      is_public: isPublic,
    })
    .select()
    .single()
  if (groupError || !group) return { group: null as unknown as Group, error: groupError as Error }
  const { error: memberError } = await supabase.from('group_members').insert({
    group_id: (group as Group).id,
    user_id: userId,
  })
  if (memberError) return { group: group as Group, error: memberError as Error }
  return { group: group as Group, error: null }
}

/** Delete a group (only the creator can do this; CASCADE removes members) */
export async function deleteGroup(userId: string, groupId: string): Promise<{ error: Error | null }> {
  const { data } = await supabase.from('groups').select('created_by').eq('id', groupId).single()
  if (!data) return { error: new Error('Group not found') }
  if (data.created_by !== userId) return { error: new Error('Only the creator can delete this group') }
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  return { error: error ?? null }
}

/** Join a public group */
export async function joinGroup(userId: string, groupId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: userId })
  if (error) {
    if (error.code === '23505') return { error: new Error('Already in this group') }
    return { error }
  }
  return { error: null }
}

/** Leave a group */
export async function leaveGroup(userId: string, groupId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  return { error: error ?? null }
}

/** Search public groups by name */
export async function searchGroups(query: string, userId: string): Promise<GroupWithMeta[]> {
  const q = query.trim()
  if (!q) return []
  const { data: myMemberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
  const joinedIds = new Set((myMemberships ?? []).map((m) => m.group_id))
  const { data: groups } = await supabase
    .from('groups')
    .select('*')
    .eq('is_public', true)
    .ilike('name', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(20)
  if (!groups?.length) return []
  const counts = await Promise.all(
    (groups as Group[]).map(async (g) => {
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id)
      return count ?? 0
    })
  )
  return (groups as Group[]).map((g, i) => ({
    ...g,
    member_count: counts[i],
    _joined: joinedIds.has(g.id),
  })) as (GroupWithMeta & { _joined?: boolean })[]
}

/** Check if current user is a member */
export async function isMember(userId: string, groupId: string): Promise<boolean> {
  const { data } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

/** Get group members with profiles, sorted by points (rank) */
export async function getGroupMembers(groupId: string): Promise<GroupMemberWithProfile[]> {
  const { data: members } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('points', { ascending: false })
    .order('joined_at', { ascending: true })

  if (!members?.length) return []

  const userIds = members.map((m) => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, workouts_count')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null; workouts_count: number }) => [
      p.id,
      p,
    ])
  )

  return members.map((m) => {
    const profile = profileMap.get(m.user_id)
    return {
      ...m,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      workouts_count: profile?.workouts_count ?? 0,
    }
  }) as GroupMemberWithProfile[]
}

/** Get group messages */
export async function getGroupMessages(groupId: string, limit = 50): Promise<GroupMessage[]> {
  const { data } = await supabase
    .from('group_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as GroupMessage[]
}

/** Send a message to a group */
export async function sendGroupMessage(
  userId: string,
  groupId: string,
  message: string
): Promise<{ error: Error | null }> {
  const trimmed = message.trim()
  if (!trimmed) return { error: new Error('Message cannot be empty') }

  const { error } = await supabase.from('group_messages').insert({
    group_id: groupId,
    user_id: userId,
    message: trimmed,
  })

  return { error: error ?? null }
}
