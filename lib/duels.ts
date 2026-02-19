import { supabase } from '@/lib/supabase';
import type { Duel, DuelStatus, DuelType, DuelWithProfiles } from '@/types/duel';

// ──────────────────────────────────────────────
// Create a new 1v1 challenge
// ──────────────────────────────────────────────
export async function createDuel(
  challengerId: string,
  opponentId: string,
  type: DuelType = 'workout_count',
  durationDays = 7
): Promise<{ duel: Duel | null; error: Error | null }> {
  if (challengerId === opponentId) {
    return { duel: null, error: new Error("You can't challenge yourself") }
  }

  // Check no active/pending duel already exists between these two
  // Check both directions: A challenging B, or B challenging A
  const { data: existing } = await supabase
    .from('duels')
    .select('id, status')
    .or(
      `and(challenger_id.eq.${challengerId},opponent_id.eq.${opponentId}),and(challenger_id.eq.${opponentId},opponent_id.eq.${challengerId})`
    )
    .in('status', ['pending', 'active'])
    .limit(1)
    .maybeSingle()

  if (existing) {
    return {
      duel: null,
      error: new Error(
        existing.status === 'pending'
          ? 'You already have a pending challenge with this friend'
          : 'You already have an active challenge with this friend'
      ),
    }
  }

  const { data, error } = await supabase
    .from('duels')
    .insert({
      challenger_id: challengerId,
      opponent_id: opponentId,
      type,
      duration_days: durationDays,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return { duel: null, error }
  return { duel: data as Duel, error: null }
}

// ──────────────────────────────────────────────
// Accept a duel challenge
// ──────────────────────────────────────────────
export async function acceptDuel(
  duelId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { data: duel } = await supabase
    .from('duels')
    .select('*')
    .eq('id', duelId)
    .single()

  if (!duel) return { error: new Error('Duel not found') }
  if ((duel as Duel).opponent_id !== userId) return { error: new Error('Only the opponent can accept') }
  if ((duel as Duel).status !== 'pending') return { error: new Error('Duel is not pending') }

  const now = new Date()
  const endsAt = new Date(now.getTime() + (duel as Duel).duration_days * 24 * 60 * 60 * 1000)

  const { error } = await supabase
    .from('duels')
    .update({
      status: 'active',
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', duelId)

  return { error: error ?? null }
}

// ──────────────────────────────────────────────
// Decline a duel
// ──────────────────────────────────────────────
export async function declineDuel(
  duelId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { data: duel } = await supabase
    .from('duels')
    .select('*')
    .eq('id', duelId)
    .single()

  if (!duel) return { error: new Error('Duel not found') }
  if ((duel as Duel).opponent_id !== userId) return { error: new Error('Only the opponent can decline') }
  if ((duel as Duel).status !== 'pending') return { error: new Error('Duel is not pending') }

  const { error } = await supabase
    .from('duels')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', duelId)

  return { error: error ?? null }
}

// ──────────────────────────────────────────────
// Cancel a duel (only challenger, only while pending)
// ──────────────────────────────────────────────
export async function cancelDuel(
  duelId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { data: duel } = await supabase
    .from('duels')
    .select('*')
    .eq('id', duelId)
    .single()

  if (!duel) return { error: new Error('Duel not found') }
  if ((duel as Duel).challenger_id !== userId) return { error: new Error('Only the challenger can cancel') }
  if ((duel as Duel).status !== 'pending') return { error: new Error('Can only cancel pending duels') }

  const { error } = await supabase
    .from('duels')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', duelId)

  return { error: error ?? null }
}

// ──────────────────────────────────────────────
// Get all duels for a user (with profiles)
// ──────────────────────────────────────────────
export async function getUserDuels(
  userId: string,
  statusFilter?: DuelStatus[]
): Promise<DuelWithProfiles[]> {
  let query = supabase
    .from('duels')
    .select('*')
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .order('created_at', { ascending: false })

  if (statusFilter && statusFilter.length > 0) {
    query = query.in('status', statusFilter)
  }

  const { data: duels } = await query
  if (!duels?.length) return []

  // Fetch profiles for all participants
  const userIds = new Set<string>()
  for (const d of duels as Duel[]) {
    userIds.add(d.challenger_id)
    userIds.add(d.opponent_id)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', [...userIds])

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  return (duels as Duel[]).map((d) => {
    const cp = profileMap.get(d.challenger_id)
    const op = profileMap.get(d.opponent_id)
    return {
      ...d,
      challenger_display_name: cp?.display_name ?? null,
      challenger_avatar_url: cp?.avatar_url ?? null,
      opponent_display_name: op?.display_name ?? null,
      opponent_avatar_url: op?.avatar_url ?? null,
    }
  })
}

// ──────────────────────────────────────────────
// Get a single duel with profiles
// ──────────────────────────────────────────────
export async function getDuel(
  duelId: string
): Promise<DuelWithProfiles | null> {
  const { data: duel } = await supabase
    .from('duels')
    .select('*')
    .eq('id', duelId)
    .single()

  if (!duel) return null

  const d = duel as Duel
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', [d.challenger_id, d.opponent_id])

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  const cp = profileMap.get(d.challenger_id)
  const op = profileMap.get(d.opponent_id)

  return {
    ...d,
    challenger_display_name: cp?.display_name ?? null,
    challenger_avatar_url: cp?.avatar_url ?? null,
    opponent_display_name: op?.display_name ?? null,
    opponent_avatar_url: op?.avatar_url ?? null,
  }
}

// ──────────────────────────────────────────────
// Get pending duel invites for a user (received)
// ──────────────────────────────────────────────
export async function getPendingDuelInvites(
  userId: string
): Promise<DuelWithProfiles[]> {
  return getUserDuels(userId, ['pending']).then((duels) =>
    duels.filter((d) => d.opponent_id === userId)
  )
}

// ──────────────────────────────────────────────
// Check if there's an existing active/pending duel between two users
// ──────────────────────────────────────────────
export async function hasExistingDuel(
  userId1: string,
  userId2: string
): Promise<{ hasDuel: boolean; status: 'pending' | 'active' | null }> {
  const { data: existing } = await supabase
    .from('duels')
    .select('status')
    .or(
      `and(challenger_id.eq.${userId1},opponent_id.eq.${userId2}),and(challenger_id.eq.${userId2},opponent_id.eq.${userId1})`
    )
    .in('status', ['pending', 'active'])
    .limit(1)
    .maybeSingle()

  if (!existing) {
    return { hasDuel: false, status: null }
  }

  return {
    hasDuel: true,
    status: existing.status as 'pending' | 'active',
  }
}

// ──────────────────────────────────────────────
// Finalize expired duels (call from client periodically)
// ──────────────────────────────────────────────
export async function finalizeExpiredDuels(): Promise<void> {
  await supabase.rpc('finalize_expired_duels')
}
