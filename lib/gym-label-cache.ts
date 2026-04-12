/**
 * In-memory gym display labels keyed by gym UUID.
 * Fills gaps when the `gyms` join fails, params are missing, or the user returns to Home
 * before the async fetch completes — common after posting from the map flow.
 */
const byGymId = new Map<string, string>()

export function rememberGymLabel(gymId: string, label: string): void {
  const t = label.trim()
  if (!t) return
  byGymId.set(gymId, t)
}

export function getRememberedGymLabel(gymId: string | null | undefined): string | null {
  if (!gymId) return null
  return byGymId.get(gymId) ?? null
}
