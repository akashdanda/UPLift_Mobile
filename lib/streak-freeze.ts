import { supabase } from '@/lib/supabase'

export async function hasStreakFreezeAvailable(userId: string): Promise<boolean> {
  const { data } = await supabase.rpc('has_streak_freeze_available', {
    p_user_id: userId,
  })
  return data === true
}

export async function useStreakFreeze(userId: string): Promise<boolean> {
  const { data } = await supabase.rpc('use_streak_freeze', {
    p_user_id: userId,
  })
  return data === true
}
