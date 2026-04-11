/**
 * Weekly-rotating “spotlight” emoji sets for reactions.
 * Swap or extend `WEEKLY_SPOTLIGHT_SETS` anytime — index picks a row each week.
 */

/** Monday 00:00 UTC week anchor (change if you want a different rotation phase). */
const WEEK_ANCHOR_UTC_MS = Date.UTC(2025, 0, 6)

/**
 * Curated sets — intentionally a bit unhinged; rotate weekly.
 * Keep 8 single-codepoint-ish glyphs per row for layout consistency.
 */
export const WEEKLY_SPOTLIGHT_SETS: string[][] = [
  ['🗿', '😈', '🤡', '💀', '🫠', '👻', '😤', '🧿'],
  ['🦍', '🦧', '🐒', '🍌', '🥥', '🤭', '😏', '🫣'],
  ['🧃', '🌭', '🍕', '🧀', '🥨', '🫃', '😮', '🤤'],
  ['🐀', '🦆', '🦫', '🐊', '🦖', '🐙', '🦑', '🪼'],
  ['⚡', '💥', '🌪️', '🌊', '🔥', '❄️', '☄️', '🌋'],
  ['🎭', '🎪', '🤹', '🎤', '🎧', '🎮', '🕺', '💃'],
  ['🧠', '🫀', '🦷', '👁️', '👅', '🦾', '🦿', '🧬'],
  ['🛸', '👽', '🤖', '👾', '🛰️', '🌌', '🔮', '🧙'],
  ['🥶', '🥵', '😵', '🤯', '😬', '😶', '🤐', '🥴'],
  ['💅', '🤌', '🫰', '🖖', '🤙', '👊', '🫡', '🤝'],
  ['🐐', '👑', '💎', '🏆', '🥇', '✨', '🎯', '🔒'],
  ['📈', '📉', '💹', '🧾', '🗳️', '🎲', '🃏', '🧩'],
]

/** Always-available shortcuts under the weekly row */
export const REACTION_STAPLES = ['🔥', '💪', '👍', '❤️', '😂', '🙌', '😮', '😊'] as const

export function getWeeklySpotlightSet(now = new Date()): string[] {
  const ms = 7 * 24 * 60 * 60 * 1000
  const w = Math.floor((now.getTime() - WEEK_ANCHOR_UTC_MS) / ms)
  const n = WEEKLY_SPOTLIGHT_SETS.length
  const idx = ((w % n) + n) % n
  return WEEKLY_SPOTLIGHT_SETS[idx] ?? WEEKLY_SPOTLIGHT_SETS[0]!
}
