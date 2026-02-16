import type { Workout } from './workout'

export type WorkoutHighlight = {
  id: string
  user_id: string
  name: string
  cover_workout_id: string | null
  /** When set (e.g. from camera roll), used as cover instead of workout image */
  cover_image_url: string | null
  display_order: number
  created_at: string
}

export type WorkoutHighlightItem = {
  id: string
  highlight_id: string
  workout_id: string
  display_order: number
  created_at: string
}

/** For profile row: highlight with cover image URL and count */
export type HighlightForProfile = WorkoutHighlight & {
  cover_image_url: string | null
  workouts_count: number
}

/** For highlight detail view: highlight with full workout objects */
export type HighlightWithWorkouts = WorkoutHighlight & {
  workouts: Workout[]
}
