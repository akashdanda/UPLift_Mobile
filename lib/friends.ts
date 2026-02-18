import { supabase } from '@/lib/supabase'
import type { Friendship } from '@/types/friendship'
import type { ProfilePublic } from '@/types/friendship'

export type FriendWithProfile = ProfilePublic & { friendship_id: string }

/** List of accepted friends (with profile info and friendship id for unfriend) */
export async function getFriends(userId: string): Promise<FriendWithProfile[]> {
  const { data: rows } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted')
  if (!rows?.length) return []
  const friendIds = rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, workouts_count')
    .in('id', friendIds)
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as ProfilePublic]))
  return rows
    .map((r) => {
      const friendId = r.requester_id === userId ? r.addressee_id : r.requester_id
      const profile = profileMap.get(friendId)
      if (!profile) return null
      return { ...profile, friendship_id: r.id } as FriendWithProfile
    })
    .filter(Boolean) as FriendWithProfile[]
}

/** Pending requests received by the current user */
export async function getPendingReceived(userId: string): Promise<{ friendship: Friendship; requester: ProfilePublic }[]> {
  const { data: rows } = await supabase
    .from('friendships')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (!rows?.length) return []
  const ids = (rows as Friendship[]).map((r) => r.requester_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, workouts_count')
    .in('id', ids)
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as ProfilePublic]))
  return (rows as Friendship[]).map((f) => ({
    friendship: f,
    requester: profileMap.get(f.requester_id)!,
  }))
}

/** Search profiles by display name (for add friend) */
export async function searchProfiles(query: string, excludeUserId: string): Promise<ProfilePublic[]> {
  const q = query.trim()
  if (!q) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, workouts_count')
    .neq('id', excludeUserId)
    .ilike('display_name', `%${q}%`)
    .limit(20)
  return (data ?? []) as ProfilePublic[]
}

/** Send a friend request. Returns error if already exists or same user. */
export async function sendFriendRequest(requesterId: string, addresseeId: string): Promise<{ error: Error | null }> {
  if (requesterId === addresseeId) return { error: new Error("Can't add yourself") }
  const { error } = await supabase.from('friendships').insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'pending',
  })
  if (error) {
    if (error.code === '23505') return { error: new Error('Request already sent or already friends') }
    return { error }
  }
  return { error: null }
}

/** Accept a friend request (caller must be the addressee) */
export async function acceptFriendRequest(friendshipId: string, addresseeId: string): Promise<{ error: Error | null }> {
  const { data, error: fetchError } = await supabase
    .from('friendships')
    .select('addressee_id')
    .eq('id', friendshipId)
    .single()
  if (fetchError || !data || data.addressee_id !== addresseeId) return { error: new Error('Request not found') }
  const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
  return { error: error ?? null }
}

/** Decline or unfriend: delete the friendship row */
export async function removeFriendship(friendshipId: string, userId: string): Promise<{ error: Error | null }> {
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('id', friendshipId)
    .single()
  if (!data) return { error: new Error('Not found') }
  if (data.requester_id !== userId && data.addressee_id !== userId) return { error: new Error('Not allowed') }
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
  return { error: error ?? null }
}

/** Check friendship status with another user: 'none' | 'pending_sent' | 'pending_received' | 'friends' */
export type MutualFriendSuggestion = ProfilePublic & {
  mutual_count: number
  mutual_names: string[]
}

/**
 * Find people you're not friends with who share mutual friends with you.
 * Algorithm: gather friends-of-friends, count how many of your friends each person shares,
 * then rank by mutual count.
 */
export async function getMutualFriendSuggestions(
  userId: string,
  limit = 10
): Promise<MutualFriendSuggestion[]> {
  // 1. Get user's accepted friends
  const myFriends = await getFriends(userId)
  if (myFriends.length === 0) return []
  const myFriendIds = new Set(myFriends.map((f) => f.id))

  // 2. For each friend, get their friends
  const { data: fofRows } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(
      myFriends
        .map((f) => `requester_id.eq.${f.id},addressee_id.eq.${f.id}`)
        .join(',')
    )

  if (!fofRows?.length) return []

  // 3. Count how many mutual friends each non-friend has with us
  const mutualCount = new Map<string, Set<string>>()
  for (const row of fofRows as { requester_id: string; addressee_id: string }[]) {
    const friendId = myFriendIds.has(row.requester_id) ? row.requester_id : row.addressee_id
    const otherId = row.requester_id === friendId ? row.addressee_id : row.requester_id

    // Skip self, existing friends, and pending requests
    if (otherId === userId || myFriendIds.has(otherId)) continue

    if (!mutualCount.has(otherId)) mutualCount.set(otherId, new Set())
    mutualCount.get(otherId)!.add(friendId)
  }

  if (mutualCount.size === 0) return []

  // 4. Sort by mutual count descending, take top candidates
  const sorted = [...mutualCount.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limit)

  const candidateIds = sorted.map(([id]) => id)

  // 5. Check we don't already have pending requests with these people
  const { data: existingRows } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(
      candidateIds
        .map((cid) =>
          `and(requester_id.eq.${userId},addressee_id.eq.${cid}),and(requester_id.eq.${cid},addressee_id.eq.${userId})`
        )
        .join(',')
    )

  const alreadyConnected = new Set<string>()
  for (const row of (existingRows ?? []) as { requester_id: string; addressee_id: string }[]) {
    alreadyConnected.add(row.requester_id === userId ? row.addressee_id : row.requester_id)
  }

  // 6. Fetch profiles for remaining candidates
  const finalIds = candidateIds.filter((id) => !alreadyConnected.has(id))
  if (finalIds.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, workouts_count')
    .in('id', finalIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as ProfilePublic]))

  // Build name lookup for mutual friends
  const friendNameMap = new Map(myFriends.map((f) => [f.id, f.display_name ?? 'Someone']))

  return finalIds
    .map((id) => {
      const profile = profileMap.get(id)
      if (!profile) return null
      const mutuals = mutualCount.get(id)!
      const mutualNames = [...mutuals].map((mid) => friendNameMap.get(mid) ?? 'Someone').slice(0, 3)
      return {
        ...profile,
        mutual_count: mutuals.size,
        mutual_names: mutualNames,
      } as MutualFriendSuggestion
    })
    .filter(Boolean) as MutualFriendSuggestion[]
}

/** Check friendship status with another user: 'none' | 'pending_sent' | 'pending_received' | 'friends' */
export async function getFriendshipStatus(
  userId: string,
  otherId: string
): Promise<'none' | 'pending_sent' | 'pending_received' | 'friends'> {
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`)
    .maybeSingle()
  if (!data) return 'none'
  const row = data as { requester_id: string; addressee_id: string; status: string }
  if (row.status === 'accepted') return 'friends'
  if (row.requester_id === userId) return 'pending_sent'
  return 'pending_received'
}
