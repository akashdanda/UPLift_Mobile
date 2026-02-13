export type WorkoutReaction = {
  id: string
  workout_id: string
  user_id: string
  emoji: string
  reaction_image_url: string | null
  created_at: string
}

export type WorkoutReactionWithProfile = WorkoutReaction & {
  display_name: string | null
  avatar_url: string | null
}
