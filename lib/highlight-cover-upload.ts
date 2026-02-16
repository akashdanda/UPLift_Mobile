import { readAsStringAsync } from 'expo-file-system/legacy'
import { supabase } from '@/lib/supabase'

const BUCKET = 'highlight-covers'

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Upload a highlight cover image from camera roll to Supabase Storage and return the public URL.
 */
export async function uploadHighlightCover(
  userId: string,
  highlightId: string,
  uri: string
): Promise<{ url: string } | { error: Error }> {
  try {
    const filename = `cover-${Date.now()}.jpg`
    const path = `${userId}/${highlightId}/${filename}`

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
