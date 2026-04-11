import { supabase } from './supabase'

export type Gym = {
  id: string
  name: string
  address: string | null
  lat: number
  lng: number
  osm_id: string | null
  created_at?: string
  /** Photo URL from OSM image / Wikimedia tags when available */
  image_url?: string | null
}

const RADIUS_METERS = 50_000

/**
 * Manual check-in from map pin: max distance from gym centroid (OSM / Supabase).
 * ~250 ft balances big-box & campus gyms (you can move around the floor) with indoor GPS drift,
 * without letting people check in from blocks away.
 */
export const MANUAL_MAP_CHECKIN_RADIUS_FT = 250
export const MANUAL_MAP_CHECKIN_RADIUS_M = MANUAL_MAP_CHECKIN_RADIUS_FT * 0.3048

/** Simple tag predicates for Overpass (node/way each). */
const OVERPASS_SIMPLE_TAGS = [
  '"leisure"="fitness_centre"',
  '"amenity"="gym"',
  '"amenity"="fitness_centre"',
  '"leisure"="sports_centre"',
  '"leisure"="recreation_ground"',
  '"amenity"="community_centre"',
  '"leisure"="swimming_pool"',
  '"leisure"="fitness_station"',
] as const

/** Extra predicates (apartment / condo / hotel fitness rooms, indoor gyms). */
const OVERPASS_COMPOUND = [
  '"sport"="fitness"]["indoor"="yes"',
  '"room"="fitness"]["indoor"="yes"',
  '"leisure"="fitness_centre"]["indoor"="yes"',
  '"amenity"="gym"]["indoor"="yes"',
] as const

export const OVERPASS_TAGS = [...OVERPASS_SIMPLE_TAGS]

export const OVERPASS_COMPOUND_TAG_CHAINS = [...OVERPASS_COMPOUND]

/** Readable label for OSM features (apartment gyms often omit name). */
export function displayNameFromOsmTags(tags: Record<string, string> | undefined): string {
  if (!tags) return 'Fitness center'
  const n = tags.name?.trim()
  if (n) return n
  const op = tags.operator?.trim()
  if (op) return op
  const br = tags.brand?.trim()
  if (br) return br
  const access = tags.access
  const building = tags.building
  if (building === 'apartments' || building === 'residential' || tags['building:use'] === 'apartments') {
    if (access === 'private' || access === 'customers' || access === 'permissive') return 'Apartment gym'
  }
  const indoor = tags.indoor
  if (indoor === 'yes' || indoor === 'room') return 'Fitness room'
  if (access === 'private' || access === 'customers' || access === 'permissive') return 'Resident gym'
  return 'Fitness center'
}

/** Build a multi-line postal address from OSM addr:* tags. */
export function formatAddressFromOsmTags(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const full = tags['addr:full']?.trim()
  if (full) return full
  const line1: string[] = []
  const hn = tags['addr:housenumber']?.trim()
  const st = tags['addr:street']?.trim()
  if (hn && st) line1.push(`${hn} ${st}`)
  else if (st) line1.push(st)
  else if (tags['addr:place']?.trim()) line1.push(tags['addr:place'].trim())
  else if (tags['addr:road']?.trim()) line1.push(tags['addr:road'].trim())

  const line2: string[] = []
  const city = tags['addr:city']?.trim() || tags['addr:town']?.trim() || tags['addr:village']?.trim()
  const state = tags['addr:state']?.trim()
  const pc = tags['addr:postcode']?.trim()
  if (city) line2.push(city)
  if (state) line2.push(state)
  if (pc) line2.push(pc)

  const parts: string[] = []
  if (line1.length) parts.push(line1.join(' '))
  if (line2.length) parts.push(line2.join(', '))
  const out = parts.join('\n').trim()
  return out || tags['addr:street']?.trim() || null
}

/** Image URL from OSM `image`, `image:0`, `photo`, or `wikimedia_commons` when available. */
export function imageUrlFromOsmTags(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const normalize = (raw: string | undefined): string | null => {
    if (!raw?.trim()) return null
    const s = raw.trim()
    if (/^https?:\/\//i.test(s)) return s
    if (s.startsWith('//')) return `https:${s}`
    return null
  }
  for (const key of ['image', 'image:0', 'photo'] as const) {
    const u = normalize(tags[key])
    if (u) return u
  }
  const urlTag = tags.url?.trim()
  if (urlTag && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(urlTag)) {
    return normalize(urlTag) ?? urlTag
  }

  const wc = tags.wikimedia_commons?.trim()
  if (wc) {
    const fn = wc.startsWith('File:') ? wc.slice(5) : wc
    const path = fn.replace(/ /g, '_')
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(path)}`
  }
  return null
}

/**
 * Overpass query covers gyms, fitness centres, sports centres, recreation
 * grounds, community centres, pools, stations, indoor/apartment gyms.
 */
async function fetchGymsFromOverpass(lat: number, lng: number, radiusMeters: number): Promise<Gym[]> {
  const nodeQueries = OVERPASS_SIMPLE_TAGS.map(
    (t) => `node[${t}](around:${radiusMeters},${lat},${lng});`,
  ).join('')
  const wayQueries = OVERPASS_SIMPLE_TAGS.map(
    (t) => `way[${t}](around:${radiusMeters},${lat},${lng});`,
  ).join('')
  const compound = OVERPASS_COMPOUND.map(
    (c) =>
      `node[${c}](around:${radiusMeters},${lat},${lng});way[${c}](around:${radiusMeters},${lat},${lng});`,
  ).join('')

  const query = `[out:json][timeout:30];(${nodeQueries}${wayQueries}${compound});out center;`
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`)
  const json = await res.json()
  const byId = new Map<string, Gym>()

  for (const el of json.elements as any[]) {
    const typeKey = `${el.type ?? 'node'}-${el.id}`
    if (byId.has(typeKey)) continue
    const lat = (el.lat ?? el.center?.lat) as number
    const lng = (el.lon ?? el.center?.lon) as number
    if (!lat || !lng) continue
    const t = el.tags as Record<string, string> | undefined
    byId.set(typeKey, {
      id: `osm-${el.id}`,
      name: displayNameFromOsmTags(t),
      address: formatAddressFromOsmTags(t),
      lat,
      lng,
      osm_id: String(el.id),
      image_url: imageUrlFromOsmTags(t),
    })
  }

  return [...byId.values()]
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
  } catch { /* non-fatal */ }
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

/** Match OSM marker to a gym row already in memory (from getNearbyGyms). */
export function resolveGymIdFromList(gyms: Gym[], osmType: string, osmId: string): string | null {
  const idOnly = String(osmId).trim()
  const composite = `${String(osmType || 'node').toLowerCase()}-${idOnly}`
  return gyms.find((g) => g.osm_id === composite)?.id ?? gyms.find((g) => g.osm_id === idOnly)?.id ?? null
}

/** Resolve Supabase gym UUID from OSM feature (markers use Overpass type + id). */
export async function findGymIdByOsm(osmType: string, osmId: string): Promise<string | null> {
  const idOnly = String(osmId).trim()
  const composite = `${String(osmType || 'node').toLowerCase()}-${idOnly}`
  const { data: byComposite } = await supabase.from('gyms').select('id').eq('osm_id', composite).maybeSingle()
  if (byComposite?.id) return byComposite.id as string
  const { data: byId } = await supabase.from('gyms').select('id').eq('osm_id', idOnly).maybeSingle()
  return (byId?.id as string) ?? null
}

/**
 * Create or update a gym row from the map pin (Overpass) when it is missing from Supabase.
 * Uses numeric OSM id as `osm_id` to match how cached gyms are stored.
 */
export async function ensureGymFromOsmInSupabase(params: {
  osmId: string
  lat: number
  lng: number
  tags?: Record<string, string> | null
}): Promise<Gym | null> {
  const idOnly = String(params.osmId).trim()
  if (!idOnly) return null
  const tags = params.tags ?? undefined
  const row = {
    name: displayNameFromOsmTags(tags),
    address: formatAddressFromOsmTags(tags),
    lat: params.lat,
    lng: params.lng,
    location: `POINT(${params.lng} ${params.lat})`,
    osm_id: idOnly,
  }
  const { error } = await supabase.from('gyms').upsert(row, { onConflict: 'osm_id' })
  if (error) return null
  const { data, error: readErr } = await supabase
    .from('gyms')
    .select('id,name,address,lat,lng,osm_id')
    .eq('osm_id', idOnly)
    .maybeSingle()
  if (readErr || !data) return null
  return {
    id: data.id as string,
    name: data.name as string,
    address: (data.address as string | null) ?? null,
    lat: data.lat as number,
    lng: data.lng as number,
    osm_id: (data.osm_id as string | null) ?? null,
  }
}

export async function fetchGymById(id: string): Promise<Gym | null> {
  const { data, error } = await supabase
    .from('gyms')
    .select('id,name,address,lat,lng,osm_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id as string,
    name: data.name as string,
    address: (data.address as string | null) ?? null,
    lat: data.lat as number,
    lng: data.lng as number,
    osm_id: (data.osm_id as string | null) ?? null,
  }
}

export async function getNearbyGyms(lat: number, lng: number): Promise<Gym[]> {
  let cached = await fetchFromSupabase(lat, lng)

  if (cached.length < 80) {
    try {
      const fresh = await fetchGymsFromOverpass(lat, lng, RADIUS_METERS)
      await upsertGymsToCache(fresh)
      const refreshed = await fetchFromSupabase(lat, lng)
      if (refreshed.length > 0) return refreshed
      return fresh
    } catch {
      return cached
    }
  }

  return cached
}

/** Haversine distance in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
