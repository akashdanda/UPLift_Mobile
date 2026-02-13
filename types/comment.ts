export type WorkoutComment = {
  id: string
  workout_id: string
  user_id: string
  message: string | null
  gif_url: string | null
  created_at: string
}

export type WorkoutCommentWithProfile = WorkoutComment & {
  display_name: string | null
  avatar_url: string | null
}
