import { supabase } from './supabase'
import type { Gym } from './gym-service'
import { distanceMeters } from './gym-service'

/** Active presence window matches `getActivePresence` (~10 min). */
function presenceFreshSince() {
  return new Date(Date.now() - 10 * 60_000).toISOString()
}

/** Count of visible check-ins per gym (for map pulse / cluster glow). */
export async function getPresenceCountsForGymIds(gymIds: string[]): Promise<Record<string, number>> {
  if (gymIds.length === 0) return {}
  const { data, error } = await supabase
    .from('gym_presence')
    .select('gym_id')
    .in('gym_id', gymIds)
    .eq('share_with_others', true)
    .gt('checked_in_at', presenceFreshSince())

  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = row.gym_id as string
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

export type GhostGymPresence = {
  gymId: string
  osmId: string | null
  lat: number
  lng: number
  count: number
  avatarUrls: string[]
}

/**
 * Gyms within `radiusM` of the user that have at least one visible check-in.
 * Used for low-opacity “ghost” avatars on map pins.
 */
export async function getGhostPresenceNearUser(
  lat: number,
  lng: number,
  gyms: Gym[],
  radiusM: number,
  selfUserId: string | undefined,
  maxAvatars = 3,
): Promise<GhostGymPresence[]> {
  const near = gyms.filter((g) => distanceMeters(lat, lng, g.lat, g.lng) <= radiusM)
  if (near.length === 0) return []

  const ids = near.map((g) => g.id)
  const { data, error } = await supabase
    .from('gym_presence')
    .select('gym_id, user_id, avatar_url')
    .in('gym_id', ids)
    .eq('share_with_others', true)
    .gt('checked_in_at', presenceFreshSince())

  if (error) return []

  const byGym = new Map<string, { count: number; avatars: string[] }>()
  for (const row of data ?? []) {
    const gid = row.gym_id as string
    const uid = row.user_id as string
    if (selfUserId && uid === selfUserId) continue
    let cur = byGym.get(gid)
    if (!cur) {
      cur = { count: 0, avatars: [] }
      byGym.set(gid, cur)
    }
    cur.count += 1
    const av = (row.avatar_url as string | null)?.trim()
    if (av && cur.avatars.length < maxAvatars) cur.avatars.push(av)
  }

  const out: GhostGymPresence[] = []
  for (const g of near) {
    const row = byGym.get(g.id)
    if (!row || row.count <= 0) continue
    out.push({
      gymId: g.id,
      osmId: g.osm_id,
      lat: g.lat,
      lng: g.lng,
      count: row.count,
      avatarUrls: row.avatars,
    })
  }
  return out
}
