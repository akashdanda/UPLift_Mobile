/**
 * Normalize user-entered phone to E.164 for Supabase SMS auth.
 * US-centric: 10 digits → +1…; 11 digits starting with 1 → +1…; already + prefix kept.
 */
export function normalizeToE164(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const digitsOnly = trimmed.replace(/\D/g, '')
  if (digitsOnly.length === 10) return `+1${digitsOnly}`
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) return `+${digitsOnly}`
  if (trimmed.startsWith('+')) {
    const d = trimmed.replace(/\D/g, '')
    if (d.length >= 10 && d.length <= 15) return `+${d}`
  }
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) return `+${digitsOnly}`
  return null
}
