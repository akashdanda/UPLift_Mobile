import { supabase } from '@/lib/supabase'

/** Server-defined minimum install version (e.g. force users off deprecated builds). */
export async function fetchMinimumNativeVersion(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_version_config')
    .select('minimum_native_version')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data?.minimum_native_version) return null
  const v = String(data.minimum_native_version).trim()
  return v.length > 0 ? v : null
}
