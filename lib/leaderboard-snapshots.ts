import { supabase } from '@/lib/supabase'

export async function saveLeaderboardSnapshot(
  userId: string,
  scope: string,
  rank: number,
  points: number,
  period: string
): Promise<void> {
  await supabase
    .from('leaderboard_snapshots')
    .upsert(
      { user_id: userId, scope, rank, points, period },
      { onConflict: 'user_id,scope,period' }
    )
}

export async function getPreviousSnapshot(
  userId: string,
  scope: string,
  period: string
): Promise<{ rank: number; points: number } | null> {
  const { data } = await supabase
    .from('leaderboard_snapshots')
    .select('rank, points')
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('period', period)
    .maybeSingle()
  return data as { rank: number; points: number } | null
}
