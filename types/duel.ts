// ──────────────────────────────────────────────
// 1v1 Challenge (Duel) types
// ──────────────────────────────────────────────

export type DuelType = 'streak' | 'workout_count'

export type DuelStatus = 'pending' | 'active' | 'completed' | 'declined' | 'cancelled'

export type Duel = {
  id: string
  challenger_id: string
  opponent_id: string
  type: DuelType
  duration_days: number
  status: DuelStatus
  challenger_score: number
  opponent_score: number
  winner_id: string | null
  started_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

/** Duel with both participant profiles joined */
export type DuelWithProfiles = Duel & {
  challenger_display_name: string | null
  challenger_avatar_url: string | null
  opponent_display_name: string | null
  opponent_avatar_url: string | null
}
