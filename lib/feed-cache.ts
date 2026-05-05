import AsyncStorage from '@react-native-async-storage/async-storage'

import { getFriendsWorkouts, getGlobalWorkouts, type FeedItem } from '@/lib/feed'

type CacheEnvelope<T> = { v: 1; t: number; data: T }

const FRIENDS_FEED_KEY = (userId: string) => `uplift_feed_friends_v1:${userId}`
const GLOBAL_FEED_KEY = `uplift_feed_global_v1`

const memory = {
  friends: new Map<string, CacheEnvelope<FeedItem[]>>(),
  global: null as CacheEnvelope<FeedItem[]> | null,
}

export async function loadCachedFriendsFeed(userId: string): Promise<FeedItem[] | null> {
  const mem = memory.friends.get(userId)
  if (mem) return mem.data
  try {
    const raw = await AsyncStorage.getItem(FRIENDS_FEED_KEY(userId))
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<FeedItem[]>
    if (!env?.data || !Array.isArray(env.data)) return null
    memory.friends.set(userId, env)
    return env.data
  } catch {
    return null
  }
}

export async function loadCachedGlobalFeed(): Promise<FeedItem[] | null> {
  if (memory.global) return memory.global.data
  try {
    const raw = await AsyncStorage.getItem(GLOBAL_FEED_KEY)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<FeedItem[]>
    if (!env?.data || !Array.isArray(env.data)) return null
    memory.global = env
    return env.data
  } catch {
    return null
  }
}

async function persistFriendsFeed(userId: string, items: FeedItem[]) {
  const env: CacheEnvelope<FeedItem[]> = { v: 1, t: Date.now(), data: items }
  memory.friends.set(userId, env)
  try {
    await AsyncStorage.setItem(FRIENDS_FEED_KEY(userId), JSON.stringify(env))
  } catch {
    // ignore
  }
}

async function persistGlobalFeed(items: FeedItem[]) {
  const env: CacheEnvelope<FeedItem[]> = { v: 1, t: Date.now(), data: items }
  memory.global = env
  try {
    await AsyncStorage.setItem(GLOBAL_FEED_KEY, JSON.stringify(env))
  } catch {
    // ignore
  }
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

  if (cachedFriends) onFriends?.(cachedFriends, 'cache')
  if (cachedGlobal) onGlobal?.(cachedGlobal, 'cache')

  // Background refresh (do not block UI; do not clear state on failure)
  void getFriendsWorkouts(userId, daysBack ?? 30, maxRows ?? 250)
    .then((items) => {
      void persistFriendsFeed(userId, items)
      onFriends?.(items, 'network')
    })
    .catch(() => {})

  void getGlobalWorkouts(userId, daysBack ?? 30, maxRows ?? 250)
    .then((items) => {
      void persistGlobalFeed(items)
      onGlobal?.(items, 'network')
    })
    .catch(() => {})
}

