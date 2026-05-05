import AsyncStorage from '@react-native-async-storage/async-storage'

import { getNotifications, type Notification } from '@/lib/notifications'

type CacheEnvelope<T> = { v: 1; t: number; data: T }

const KEY = (userId: string) => `uplift_notifications_v1:${userId}`

let memory: { userId: string; env: CacheEnvelope<Notification[]> } | null = null

export async function loadCachedNotifications(userId: string): Promise<Notification[] | null> {
  if (memory?.userId === userId) return memory.env.data
  try {
    const raw = await AsyncStorage.getItem(KEY(userId))
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<Notification[]>
    if (!env?.data || !Array.isArray(env.data)) return null
    memory = { userId, env }
    return env.data
  } catch {
    return null
  }
}

async function persist(userId: string, items: Notification[]) {
  const env: CacheEnvelope<Notification[]> = { v: 1, t: Date.now(), data: items }
  memory = { userId, env }
  try {
    await AsyncStorage.setItem(KEY(userId), JSON.stringify(env))
  } catch {
    // ignore
  }
}

/**
 * Cache-first notifications preload.
 * - Applies cached items immediately (if present)
 * - Refreshes silently in the background
 */
export async function preloadNotifications(opts: {
  userId: string
  limit?: number
  onItems?: (items: Notification[], source: 'cache' | 'network') => void
}): Promise<void> {
  const { userId, limit, onItems } = opts

  const cached = await loadCachedNotifications(userId)
  if (cached) onItems?.(cached, 'cache')

  void getNotifications(userId, limit ?? 50)
    .then((items) => {
      void persist(userId, items)
      onItems?.(items, 'network')
    })
    .catch(() => {})
}

