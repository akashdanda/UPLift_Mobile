// ──────────────────────────────────────────────
// Leveling System — "Bronze → Legend"
// XP is computed from existing profile stats + achievements.
// No new DB tables needed — purely derived data.
// ──────────────────────────────────────────────

export type LevelTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'legend'

export type LevelDefinition = {
  tier: LevelTier
  title: string
  emoji: string
  minXP: number
  /** Border / ring color around avatar */
  color: string
  /** Lighter glow color for subtle background effects */
  glowColor: string
}

/** Ordered from lowest → highest. The last entry has no upper bound. */
export const LEVEL_TIERS: LevelDefinition[] = [
  {
    tier: 'bronze',
    title: 'Bronze',
    emoji: '🥉',
    minXP: 0,
    color: '#CD7F32',
    glowColor: '#CD7F3230',
  },
  {
    tier: 'silver',
    title: 'Silver',
    emoji: '🥈',
    minXP: 150,
    color: '#94A3B8',
    glowColor: '#94A3B830',
  },
  {
    tier: 'gold',
    title: 'Gold',
    emoji: '🥇',
    minXP: 400,
    color: '#EAB308',
    glowColor: '#EAB30830',
  },
  {
    tier: 'platinum',
    title: 'Platinum',
    emoji: '💎',
    minXP: 700,
    color: '#6366F1',
    glowColor: '#6366F130',
  },
  {
    tier: 'diamond',
    title: 'Diamond',
    emoji: '💠',
    minXP: 1100,
    color: '#22D3EE',
    glowColor: '#22D3EE30',
  },
  {
    tier: 'master',
    title: 'Master',
    emoji: '⚜️',
    minXP: 2000,
    color: '#EC4899',
    glowColor: '#EC489930',
  },
  {
    tier: 'legend',
    title: 'Legend',
    emoji: '👑',
    minXP: 3500,
    color: '#F59E0B',
    glowColor: '#F59E0B30',
  },
]

export type UserLevel = {
  /** Current level definition */
  level: LevelDefinition
  /** Total XP */
  xp: number
  /** Next level definition, or null if max level */
  nextLevel: LevelDefinition | null
  /** 0–1 progress toward the next level (1 if max) */
  progress: number
  /** XP needed to reach next level (0 if max) */
  xpToNext: number
}
