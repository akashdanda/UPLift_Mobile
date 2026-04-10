import { supabase } from './supabase'

export type PresenceRow = {
  id: string
  user_id: string
  gym_id: string
  display_name: string | null
  avatar_url: string | null
  streak: number
  checked_in_at: string
}

export async function getActivePresence(gymId: string): Promise<PresenceRow[]> {
  const { data, error } = await supabase
    .from('gym_presence')
    .select('*')
    .eq('gym_id', gymId)
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
}) {
  const { error } = await supabase.from('gym_presence').upsert(
    {
      user_id: params.userId,
      gym_id: params.gymId,
      display_name: params.displayName,
      avatar_url: params.avatarUrl,
      streak: params.streak,
      checked_in_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,gym_id' },
  )
  if (error) throw error
}

export async function checkOut(userId: string, gymId: string) {
  await supabase.from('gym_presence').delete().eq('user_id', userId).eq('gym_id', gymId)
}

export async function clearAllPresence(userId: string) {
  await supabase.from('gym_presence').delete().eq('user_id', userId)
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
