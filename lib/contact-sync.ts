import * as Contacts from 'expo-contacts'
import { Platform } from 'react-native'

import { supabase } from '@/lib/supabase'
import type { ProfilePublic } from '@/types/friendship'

const MAX_PHONES_TO_MATCH = 500

/** Best-effort E.164: strips non-digits, defaults US (+1) for 10-digit numbers. */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length >= 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.trim().startsWith('+')) return `+${digits}`
  if (digits.length >= 10) return `+${digits}`
  return null
}

export async function requestContactsPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const { status } = await Contacts.requestPermissionsAsync()
  return status === 'granted'
}

/** Collect unique normalized phone numbers from the device address book. */
export async function getNormalizedContactPhoneNumbers(): Promise<string[]> {
  if (Platform.OS === 'web') return []
  const phones: string[] = []
  const add = (raw: string | undefined) => {
    const n = normalizePhoneE164(raw)
    if (n) phones.push(n)
  }
  let offset = 0
  const pageSize = 400
  while (true) {
    const { data, hasNextPage } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      pageSize,
      pageOffset: offset,
    })
    for (const c of data) {
      for (const ph of c.phoneNumbers ?? []) {
        add(ph.number)
      }
    }
    offset += data.length
    if (!hasNextPage || data.length === 0) break
  }
  return [...new Set(phones)].slice(0, MAX_PHONES_TO_MATCH)
}

/** Match saved Uplift profiles whose phone is in the list (server-side; respects discoverability). */
export async function matchProfilesByPhoneNumbers(
  currentUserId: string,
  phoneNumbers: string[]
): Promise<ProfilePublic[]> {
  if (phoneNumbers.length === 0) return []
  const { data, error } = await supabase.rpc('match_profiles_by_phone_numbers', {
    p_phone_numbers: phoneNumbers,
    p_exclude_user_id: currentUserId,
  })
  if (error) {
    console.error('match_profiles_by_phone_numbers', error.message)
    return []
  }
  return (data ?? []) as ProfilePublic[]
}
