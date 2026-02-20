import { supabase } from '@/lib/supabase'
import type { Group, GroupMemberWithProfile, GroupMessage, GroupRole } from '@/types/group'

export type { GroupMemberWithProfile, GroupMessage, GroupRole }

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
  tags: string[] = [],
  avatarUrl: string | null = null,
  location: string | null = null,
  isPublic: boolean = true
): Promise<{ group: Group; error: Error | null }> {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      tags: tags.length > 0 ? tags : [],
      avatar_url: avatarUrl,
      location: location?.trim() || null,
      created_by: userId,
      is_public: isPublic,
    })
    .select()
    .single()
  if (groupError || !group) return { group: null as unknown as Group, error: groupError as Error }
  const { error: memberError } = await supabase.from('group_members').insert({
    group_id: (group as Group).id,
    user_id: userId,
    role: 'owner',
  })
  if (memberError) return { group: group as Group, error: memberError as Error }
  return { group: group as Group, error: null }
}

/** Update a group (owner or admin can update) */
export async function updateGroup(
  groupId: string,
  userId: string,
  updates: {
    name?: string
    description?: string | null
    tags?: string[]
    avatar_url?: string | null
    location?: string | null
    is_public?: boolean
  }
): Promise<{ error: Error | null }> {
  // Verify user is owner or admin
  const role = await getMemberRole(groupId, userId)
  if (!role || role === 'member') {
    return { error: new Error('Only group owner or admin can update the group') }
  }

  const updateData: any = {}
  if (updates.name !== undefined) updateData.name = updates.name.trim()
  if (updates.description !== undefined) updateData.description = updates.description?.trim() || null
  if (updates.tags !== undefined) updateData.tags = updates.tags.length > 0 ? updates.tags : []
  if (updates.avatar_url !== undefined) updateData.avatar_url = updates.avatar_url
  if (updates.location !== undefined) updateData.location = updates.location?.trim() || null
  if (updates.is_public !== undefined) updateData.is_public = updates.is_public

  const { error } = await supabase.from('groups').update(updateData).eq('id', groupId)

  return { error: error ?? null }
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

/** Get a single group with member count */
export async function getGroupDetails(groupId: string): Promise<GroupWithMeta | null> {
  const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).single()
  if (!group) return null

  const { count } = await supabase
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)

  return { ...(group as Group), member_count: count ?? 0 } as GroupWithMeta
}

/** Get a user's role in a group */
export async function getMemberRole(groupId: string, userId: string): Promise<GroupRole | null> {
  const { data } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.role as GroupRole) ?? null
}

/** Promote a member to admin (only owner or admin can do this) */
export async function promoteMember(
  groupId: string,
  actorId: string,
  targetUserId: string
): Promise<{ error: Error | null }> {
  const actorRole = await getMemberRole(groupId, actorId)
  if (!actorRole || actorRole === 'member') {
    return { error: new Error('Only owner or admin can promote members') }
  }

  const targetRole = await getMemberRole(groupId, targetUserId)
  if (!targetRole) return { error: new Error('User is not a member of this group') }
  if (targetRole === 'owner') return { error: new Error('Cannot change the owner\'s role') }
  if (targetRole === 'admin') return { error: new Error('User is already an admin') }

  const { error } = await supabase
    .from('group_members')
    .update({ role: 'admin' })
    .eq('group_id', groupId)
    .eq('user_id', targetUserId)

  return { error: error ?? null }
}

/** Demote an admin back to member (only owner can demote admins) */
export async function demoteMember(
  groupId: string,
  actorId: string,
  targetUserId: string
): Promise<{ error: Error | null }> {
  const actorRole = await getMemberRole(groupId, actorId)
  if (actorRole !== 'owner') {
    return { error: new Error('Only the owner can demote admins') }
  }

  const targetRole = await getMemberRole(groupId, targetUserId)
  if (!targetRole) return { error: new Error('User is not a member of this group') }
  if (targetRole === 'owner') return { error: new Error('Cannot demote the owner') }
  if (targetRole === 'member') return { error: new Error('User is already a member') }

  const { error } = await supabase
    .from('group_members')
    .update({ role: 'member' })
    .eq('group_id', groupId)
    .eq('user_id', targetUserId)

  return { error: error ?? null }
}

/** Kick a member from the group (owner/admin can kick, but not the owner) */
export async function kickMember(
  groupId: string,
  actorId: string,
  targetUserId: string
): Promise<{ error: Error | null }> {
  const actorRole = await getMemberRole(groupId, actorId)
  if (!actorRole || actorRole === 'member') {
    return { error: new Error('Only owner or admin can kick members') }
  }

  const targetRole = await getMemberRole(groupId, targetUserId)
  if (!targetRole) return { error: new Error('User is not a member of this group') }
  if (targetRole === 'owner') return { error: new Error('Cannot kick the owner') }

  // Admins cannot kick other admins
  if (actorRole === 'admin' && targetRole === 'admin') {
    return { error: new Error('Admins cannot kick other admins') }
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', targetUserId)

  return { error: error ?? null }
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

// ============================================================
// Group Invites
// ============================================================

export type GroupInvite = {
  id: string
  group_id: string
  invited_by: string
  invited_user_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export type GroupInviteWithDetails = GroupInvite & {
  group_name?: string
  inviter_name?: string
}

/** Invite a friend to a group */
export async function inviteToGroup(
  groupId: string,
  inviterId: string,
  inviteeId: string
): Promise<{ error: Error | null }> {
  const already = await isMember(inviteeId, groupId)
  if (already) return { error: new Error('User is already a member') }

  const { error } = await supabase.from('group_invites').insert({
    group_id: groupId,
    invited_by: inviterId,
    invited_user_id: inviteeId,
  })

  if (error) {
    if (error.code === '23505') return { error: new Error('Invite already sent') }
    return { error }
  }
  return { error: null }
}

/** Get pending invites for a group (for the invite modal) */
export async function getGroupPendingInvites(groupId: string): Promise<string[]> {
  const { data } = await supabase
    .from('group_invites')
    .select('invited_user_id')
    .eq('group_id', groupId)
    .eq('status', 'pending')
  return (data ?? []).map((r) => r.invited_user_id)
}

/** Get pending group invites received by a user */
export async function getPendingGroupInvitesForUser(
  userId: string
): Promise<GroupInviteWithDetails[]> {
  const { data: invites } = await supabase
    .from('group_invites')
    .select('*')
    .eq('invited_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!invites?.length) return []

  const groupIds = [...new Set(invites.map((i) => i.group_id))]
  const inviterIds = [...new Set(invites.map((i) => i.invited_by))]

  const [{ data: groups }, { data: profiles }] = await Promise.all([
    supabase.from('groups').select('id, name').in('id', groupIds),
    supabase.from('profiles').select('id, display_name').in('id', inviterIds),
  ])

  const groupMap = new Map((groups ?? []).map((g) => [g.id, g.name]))
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))

  return (invites as GroupInvite[]).map((inv) => ({
    ...inv,
    group_name: groupMap.get(inv.group_id) ?? 'Unknown Group',
    inviter_name: profileMap.get(inv.invited_by) ?? 'Someone',
  }))
}

/** Accept a group invite (adds user as member and updates invite status) */
export async function acceptGroupInvite(
  inviteId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { data: invite } = await supabase
    .from('group_invites')
    .select('*')
    .eq('id', inviteId)
    .eq('invited_user_id', userId)
    .single()

  if (!invite) return { error: new Error('Invite not found') }

  const { error: joinError } = await supabase.from('group_members').insert({
    group_id: invite.group_id,
    user_id: userId,
  })

  if (joinError) {
    if (joinError.code === '23505') {
      // Already a member, just update the invite status
    } else {
      return { error: joinError }
    }
  }

  const { error: updateError } = await supabase
    .from('group_invites')
    .update({ status: 'accepted' })
    .eq('id', inviteId)

  return { error: updateError ?? null }
}

/** Decline a group invite */
export async function declineGroupInvite(
  inviteId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('group_invites')
    .update({ status: 'declined' })
    .eq('id', inviteId)
    .eq('invited_user_id', userId)

  return { error: error ?? null }
}
