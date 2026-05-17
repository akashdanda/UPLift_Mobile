import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  fillMissingGymLabels,
  getFriendsWorkouts,
  getGlobalWorkouts,
  type FeedItem,
} from '@/lib/feed'

type CacheEnvelope<T> = { v: 1; t: number; data: T }

const FRIENDS_FEED_KEY_V2 = (userId: string) => `uplift_feed_friends_v2:${userId}`
const FRIENDS_FEED_KEY_V1 = (userId: string) => `uplift_feed_friends_v1:${userId}`
const GLOBAL_FEED_KEY_V2 = `uplift_feed_global_v2`
const GLOBAL_FEED_KEY_V1 = `uplift_feed_global_v1`

const memory = {
  friends: new Map<string, CacheEnvelope<FeedItem[]>>(),
  global: null as CacheEnvelope<FeedItem[]> | null,
}

async function readFeedCache(key: string): Promise<FeedItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<FeedItem[]>
    if (!env?.data || !Array.isArray(env.data)) return null
    return env.data
  } catch {
    return null
  }
}

export async function loadCachedFriendsFeed(userId: string): Promise<FeedItem[] | null> {
  const mem = memory.friends.get(userId)
  if (mem?.data?.length) return mem.data

  const v2 = await readFeedCache(FRIENDS_FEED_KEY_V2(userId))
  if (v2?.length) {
    memory.friends.set(userId, { v: 1, t: Date.now(), data: v2 })
    return v2
  }

  const v1 = await readFeedCache(FRIENDS_FEED_KEY_V1(userId))
  if (v1?.length) {
    memory.friends.set(userId, { v: 1, t: Date.now(), data: v1 })
    return v1
  }
  return null
}

export async function loadCachedGlobalFeed(): Promise<FeedItem[] | null> {
  if (memory.global?.data?.length) return memory.global.data

  const v2 = await readFeedCache(GLOBAL_FEED_KEY_V2)
  if (v2?.length) {
    memory.global = { v: 1, t: Date.now(), data: v2 }
    return v2
  }

  const v1 = await readFeedCache(GLOBAL_FEED_KEY_V1)
  if (v1?.length) {
    memory.global = { v: 1, t: Date.now(), data: v1 }
    return v1
  }
  return null
}

async function persistFriendsFeed(userId: string, items: FeedItem[]) {
  if (!items.length) return
  const env: CacheEnvelope<FeedItem[]> = { v: 1, t: Date.now(), data: items }
  memory.friends.set(userId, env)
  try {
    await AsyncStorage.setItem(FRIENDS_FEED_KEY_V2(userId), JSON.stringify(env))
  } catch {
    // ignore
  }
}

async function persistGlobalFeed(items: FeedItem[]) {
  if (!items.length) return
  const env: CacheEnvelope<FeedItem[]> = { v: 1, t: Date.now(), data: items }
  memory.global = env
  try {
    await AsyncStorage.setItem(GLOBAL_FEED_KEY_V2, JSON.stringify(env))
  } catch {
    // ignore
  }
}

async function hydrateAndDeliver(items: FeedItem[], deliver: (items: FeedItem[]) => void) {
  const hydrated = [...items]
  try {
    await fillMissingGymLabels(hydrated)
  } catch {
    // gym labels are optional — never block showing posts
  }
  deliver(hydrated)
}

/**
 * Preload both feeds:
 * - Immediately returns cached data (if present)
 * - Refreshes in background without clearing UI
 */
export async function preloadFeeds(opts: {
  userId: string
  daysBack?: number
  maxRows?: number
  onFriends?: (items: FeedItem[], source: 'cache' | 'network') => void
  onGlobal?: (items: FeedItem[], source: 'cache' | 'network') => void
}): Promise<void> {
  const { userId, daysBack, maxRows, onFriends, onGlobal } = opts

  const [cachedFriends, cachedGlobal] = await Promise.all([
    loadCachedFriendsFeed(userId),
    loadCachedGlobalFeed(),
  ])

  if (cachedFriends?.length) {
    void hydrateAndDeliver(cachedFriends, (items) => onFriends?.(items, 'cache'))
  }
  if (cachedGlobal?.length) {
    void hydrateAndDeliver(cachedGlobal, (items) => onGlobal?.(items, 'cache'))
  }

  void getFriendsWorkouts(userId, daysBack ?? 30, maxRows ?? 250)
    .then((items) => {
      void persistFriendsFeed(userId, items)
      onFriends?.(items, 'network')
    })
    .catch((err) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[feed] friends feed load failed:', err)
      }
    })

  void getGlobalWorkouts(userId, daysBack ?? 30, maxRows ?? 250)
    .then((items) => {
      void persistGlobalFeed(items)
      onGlobal?.(items, 'network')
    })
    .catch((err) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[feed] global feed load failed:', err)
      }
    })
}
