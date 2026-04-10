import AsyncStorage from '@react-native-async-storage/async-storage'

import type { LeaderboardRow, LeaderboardScope } from '@/lib/leaderboard'

const STORAGE_KEY = 'leaderboardSeenRanks_v1'

export function buildSeenBoardKey(period: string, scope: LeaderboardScope): string {
  return `${period}|${scope}|`
}

export async function loadSeenRanks(key: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const all = JSON.parse(raw) as Record<string, Record<string, number>>
    return all[key] ?? {}
  } catch {
    return {}
  }
}

/** Persists current ranks so the next load can show green/red movement vs this visit. */
export async function saveSeenRanks(key: string, rows: LeaderboardRow[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const all: Record<string, Record<string, number>> = raw ? JSON.parse(raw) : {}
    const next: Record<string, number> = {}
    for (const row of rows) next[row.id] = row.rank
    all[key] = next
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}
