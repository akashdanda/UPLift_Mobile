import { supabase } from './supabase'

export type Gym = {
  id: string
  name: string
  address: string | null
  lat: number
  lng: number
  osm_id: string | null
  created_at?: string
}

/** Radius for cached / proximity gym list (Supabase + RN). Map WebView loads more as you pan. */
const RADIUS_METERS = 50_000 // ~31 miles — was 8047 (~5 mi), which capped results (~dozen–twenty in dense areas)

async function fetchGymsFromOverpass(lat: number, lng: number, radiusMeters: number): Promise<Gym[]> {
  const query = `
    [out:json][timeout:25];
    (
      node["leisure"="fitness_centre"](around:${radiusMeters},${lat},${lng});
      node["amenity"="gym"](around:${radiusMeters},${lat},${lng});
      way["leisure"="fitness_centre"](around:${radiusMeters},${lat},${lng});
      way["amenity"="gym"](around:${radiusMeters},${lat},${lng});
    );
    out center;
  `
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`)
  const json = await res.json()
  return (json.elements as any[])
    .map((el) => ({
      id: `osm-${el.id}`,
      name: (el.tags?.name as string) || 'Gym',
      address: (el.tags?.['addr:street'] as string) || null,
      lat: (el.lat ?? el.center?.lat) as number,
      lng: (el.lon ?? el.center?.lon) as number,
      osm_id: String(el.id),
    }))
    .filter((g) => g.lat && g.lng && g.name)
}

async function upsertGymsToCache(gyms: Gym[]) {
  if (gyms.length === 0) return
  try {
    await supabase.from('gyms').upsert(
      gyms.map((g) => ({
        name: g.name,
        address: g.address,
        lat: g.lat,
        lng: g.lng,
        location: `POINT(${g.lng} ${g.lat})`,
        osm_id: g.osm_id,
      })),
      { onConflict: 'osm_id' },
    )
  } catch { /* cache write failure is non-fatal */ }
}

async function fetchFromSupabase(lat: number, lng: number): Promise<Gym[]> {
  try {
    const { data, error } = await supabase.rpc('get_nearby_gyms', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: RADIUS_METERS,
    })
    if (error || !data) return []
    return data as Gym[]
  } catch {
    return []
  }
}

/** If DB has fewer than this within radius, pull from Overpass again (fixes stale 5‑mi cache). */
const MIN_GYMS_BEFORE_SKIP_OVERPASS = 60

export async function getNearbyGyms(lat: number, lng: number): Promise<Gym[]> {
  console.log('[GymService] Checking Supabase cache...')
  let cached = await fetchFromSupabase(lat, lng)

  if (cached.length < MIN_GYMS_BEFORE_SKIP_OVERPASS) {
    console.log('[GymService] Refreshing from Overpass (cache has', cached.length, 'gyms)...')
    try {
      const overpassGyms = await fetchGymsFromOverpass(lat, lng, RADIUS_METERS)
      console.log('[GymService] Overpass returned', overpassGyms.length, 'gyms')
      await upsertGymsToCache(overpassGyms)
      const refreshed = await fetchFromSupabase(lat, lng)
      if (refreshed.length > 0) return refreshed
      return overpassGyms
    } catch (e) {
      console.warn('[GymService] Overpass failed:', e)
      if (cached.length > 0) return cached
      return []
    }
  }

  console.log('[GymService] Cache hit:', cached.length, 'gyms')
  return cached
}

/** Haversine distance in meters between two coordinates. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
