export const WORKOUT_TYPES = [
  { value: 'cardio', label: 'Cardio', emoji: '🏃' },
  { value: 'strength', label: 'Strength', emoji: '💪' },
  { value: 'sport', label: 'Sports specific', emoji: '⚽' },
  { value: 'rest', label: 'Active rest day', emoji: '🧘' },
] as const

export type WorkoutType = (typeof WORKOUT_TYPES)[number]['value']

export type Workout = {
  id: string
  user_id: string
  workout_date: string // YYYY-MM-DD
  image_url: string
  /** Optional second photo (BeReal-style dual camera); tap to swap which is big. */
  secondary_image_url?: string | null
  /** cardio | strength | sport | rest. Default strength. */
  workout_type?: WorkoutType | null
  caption: string | null
  created_at: string
}
