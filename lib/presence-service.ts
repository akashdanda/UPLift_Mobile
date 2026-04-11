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
  /** Device location when they checked in (arena map); null for legacy rows. */
  check_in_lat?: number | null
  check_in_lng?: number | null
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
    .eq('share_with_others', true)
    .gt('checked_in_at', new Date(Date.now() - 10 * 60_000).toISOString())

  if (error) throw error
  return (data ?? []) as PresenceRow[]
}

export async function checkIn(params: {
  userId: string
  gymId: string
  displayName: string | null
  avatarUrl: string | null
  streak: number
  /** When false, row still authorizes posting but user is omitted from others-at-gym lists. */
  shareWithOthers: boolean
  /** Optional GPS at check-in; stored for arena map accuracy. */
  checkInLat?: number | null
  checkInLng?: number | null
}) {
  const baseRow = {
    user_id: params.userId,
    gym_id: params.gymId,
    display_name: params.displayName,
    avatar_url: params.avatarUrl,
    streak: params.streak,
    share_with_others: params.shareWithOthers,
    checked_in_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('gym_presence').upsert(baseRow, { onConflict: 'user_id,gym_id' })
  if (error) throw error

  const lat = params.checkInLat
  const lng = params.checkInLng
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const { error: coordErr } = await supabase
      .from('gym_presence')
      .update({ check_in_lat: lat, check_in_lng: lng })
      .eq('user_id', params.userId)
      .eq('gym_id', params.gymId)
    // Projects without the migration have no columns — check-in must still succeed.
    if (coordErr && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[presence] check_in_lat/lng update skipped:', coordErr.message)
    }
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
