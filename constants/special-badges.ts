/** Special badges assigned to specific users (by display_name). */

export type SpecialBadge = {
  label: string
  emoji: string
  color: string
  bgColor: string
}

const BADGE_DEFS: Record<string, SpecialBadge> = {
  developer: {
    label: 'Developer',
    emoji: '🛠️',
    color: '#c084fc',
    bgColor: '#c084fc20',
  },
  betaTester: {
    label: 'Beta Tester',
    emoji: '🧪',
    color: '#34d399',
    bgColor: '#34d39920',
  },
}

/**
 * Map of display_name (lowercased) → badge.
 * Add new users here as needed.
 */
const USER_BADGES: Record<string, SpecialBadge> = {
  'jonah chiss': BADGE_DEFS.developer,
  'ash kash': BADGE_DEFS.developer,
  'gabriel april': BADGE_DEFS.betaTester,
}

/** Look up a special badge for a user by display name. Returns undefined if none. */
export function getSpecialBadge(displayName: string | null | undefined): SpecialBadge | undefined {
  if (!displayName) return undefined
  return USER_BADGES[displayName.trim().toLowerCase()]
}
