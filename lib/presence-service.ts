import { supabase } from './supabase'

export type PresenceRow = {
  id: string
  user_id: string
  gym_id: string
  display_name: string | null
  avatar_url: string | null
  streak: number
  checked_in_at: string
  share_with_others?: boolean
}

/** Map visible check-in count to a simple crowdedness tier (for map UI). */
export function crowdLevelFromCount(n: number): {
  level: 'quiet' | 'light' | 'moderate' | 'busy'
  label: string
} {
  if (n <= 0) return { level: 'quiet', label: 'Quiet' }
  if (n <= 2) return { level: 'light', label: 'Light' }
  if (n <= 5) return { level: 'moderate', label: 'Moderate' }
  return { level: 'busy', label: 'Busy' }
}

export async function getActivePresence(gymId: string): Promise<PresenceRow[]> {
  const { data, error } = await supabase
    .from('gym_presence')
    .select('*')
    .eq('gym_id', gymId)
    .gt('checked_in_at', new Date(Date.now() - 10 * 60_000).toISOString())

  if (error) throw error
  const rows = (data ?? []) as PresenceRow[]
  // Filter in memory so it works before migration `share_with_others` exists; omitting column reads as visible.
  return rows.filter((r) => r.share_with_others !== false)
}

export async function checkIn(params: {
  userId: string
  gymId: string
  displayName: string | null
  avatarUrl: string | null
  streak: number
  /** When false, row still authorizes posting but user is omitted from others-at-gym lists. */
  shareWithOthers: boolean
}) {
  const base = {
    user_id: params.userId,
    gym_id: params.gymId,
    display_name: params.displayName,
    avatar_url: params.avatarUrl,
    streak: params.streak,
    checked_in_at: new Date().toISOString(),
  }

  let { error } = await supabase.from('gym_presence').upsert(
    { ...base, share_with_others: params.shareWithOthers },
    { onConflict: 'user_id,gym_id' },
  )

  // Older DBs without migration 20260410201000 — column missing in PostgREST schema cache
  if (
    error &&
    (/share_with_others|schema cache/i.test(error.message) || /share_with_others/i.test(String(error.details)))
  ) {
    ;({ error } = await supabase.from('gym_presence').upsert(base, { onConflict: 'user_id,gym_id' }))
  }

  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' — ') || 'Check-in request failed'
    throw new Error(msg)
  }
}

export async function checkOut(userId: string, gymId: string) {
  await supabase.from('gym_presence').delete().eq('user_id', userId).eq('gym_id', gymId)
}

export async function clearAllPresence(userId: string) {
  await supabase.from('gym_presence').delete().eq('user_id', userId)
}

/** True if this user currently has an active check-in row for the given gym. */
export async function isCheckedInAtGym(userId: string, gymId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('gym_presence')
    .select('id')
    .eq('user_id', userId)
    .eq('gym_id', gymId)
    .maybeSingle()
  if (error) return false
  return !!data
}

export function subscribeToPresence(
  gymId: string,
  onUpdate: (rows: PresenceRow[]) => void,
) {
  const channel = supabase
    .channel(`gym_presence:${gymId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'gym_presence',
        filter: `gym_id=eq.${gymId}`,
      },
      () => {
        getActivePresence(gymId).then(onUpdate).catch(() => {})
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
