import { supabase } from '@/lib/supabase'
import type { Workout } from '@/types/workout'

export type FlashbackPeriod = '1_month' | '6_months' | '1_year'

export type FlashbackItem = {
  period: FlashbackPeriod
  label: string
  emoji: string
  workout: Workout
}

/**
 * Get the local date string for "X ago" based on today's date.
 * Returns YYYY-MM-DD.
 */
function getDateAgo(monthsAgo: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - monthsAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PERIODS: { period: FlashbackPeriod; monthsAgo: number; label: string; emoji: string }[] = [
  { period: '1_month', monthsAgo: 1, label: '1 Month Ago', emoji: '📸' },
  { period: '6_months', monthsAgo: 6, label: '6 Months Ago', emoji: '🔙' },
  { period: '1_year', monthsAgo: 12, label: '1 Year Ago', emoji: '🗓️' },
]

/**
 * Fetch flashback workouts for the current user.
 * Looks for workouts on the same day 1 month, 6 months, and 1 year ago.
 */
export async function getFlashbacks(userId: string): Promise<FlashbackItem[]> {
  const dates = PERIODS.map((p) => ({
    ...p,
    date: getDateAgo(p.monthsAgo),
  }))

  const targetDates = dates.map((d) => d.date)

  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .in('workout_date', targetDates)
    .order('workout_date', { ascending: false })

  if (error || !data?.length) return []

  const workoutsByDate = new Map<string, Workout>()
  for (const w of data as Workout[]) {
    // Keep the first (most recent) workout per date
    if (!workoutsByDate.has(w.workout_date)) {
      workoutsByDate.set(w.workout_date, w)
    }
  }

  const items: FlashbackItem[] = []
  for (const d of dates) {
    const workout = workoutsByDate.get(d.date)
    if (workout) {
      items.push({
        period: d.period,
        label: d.label,
        emoji: d.emoji,
        workout,
      })
    }
  }

  return items
}
