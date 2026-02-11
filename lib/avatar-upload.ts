import { readAsStringAsync } from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'

const BUCKET = 'avatars'

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Upload a profile photo to Supabase Storage and return the public URL.
 * Uses expo-file-system for reliable reading of file:// and content:// URIs on React Native.
 */
export async function uploadAvatar(userId: string, uri: string): Promise<{ url: string } | { error: Error }> {
  try {
    const filename = `avatar-${Date.now()}.jpg`
    const path = `${userId}/${filename}`

    const base64 = await readAsStringAsync(uri, { encoding: 'base64' })
    const bytes = base64ToUint8Array(base64)

    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    })

    if (error) return { error }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { url: data.publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('Upload failed') }
  }
}
