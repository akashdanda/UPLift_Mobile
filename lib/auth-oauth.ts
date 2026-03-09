import { supabase } from '@/lib/supabase'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'

/**
 * Get the redirect URL for OAuth.
 *
 * - In development (Expo Go / local), we use Linking.createURL so you can copy
 *   the printed exp:// URL into Supabase → Auth → URL Configuration → Redirect URLs.
 * - In production (TestFlight / App Store), we always use the native app scheme
 *   so the OAuth flow returns to the standalone app, not Expo Go.
 *
 * Make sure BOTH of these are in Supabase Redirect URLs:
 * - The exp://... URL you see in dev logs
 * - uplift://auth/callback
 */
export function getRedirectUrl(): string {
  if (__DEV__) {
    const devUrl = Linking.createURL('auth/callback')
    console.log('[OAuth] Dev redirect URL – add to Supabase Redirect URLs:', devUrl)
    return devUrl
  }

  // Standalone / production builds use the app scheme defined in app.json ("uplift")
  return 'uplift://auth/callback'
}

/**
 * Parse tokens from Supabase OAuth redirect URL (hash fragment) and set the session.
 */
export async function setSessionFromRedirectUrl(url: string): Promise<void> {
  const hash = url.includes('#') ? url.split('#')[1] : ''
  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token })
  }
}

/**
 * Sign in with Google via OAuth. Opens browser; on success, sets session and returns { error: null }.
 */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  try {
    const redirectTo = getRedirectUrl()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })

    if (error) return { error }
    if (!data?.url) return { error: new Error('No OAuth URL returned') }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    if (result.type !== 'success' || !result.url) {
      return { error: new Error('Sign in was cancelled or failed') }
    }

    await setSessionFromRedirectUrl(result.url)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('Google sign in failed') }
  }
}

/**
 * Sign in with Apple via OAuth. Opens browser; on success, sets session and returns { error: null }.
 *
 * Make sure the 'apple' provider is enabled in Supabase and the redirect URL from getRedirectUrl()
 * is added under Authentication → URL Configuration → Redirect URLs.
 */
export async function signInWithApple(): Promise<{ error: Error | null }> {
  try {
    const redirectTo = getRedirectUrl()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })

    if (error) return { error }
    if (!data?.url) return { error: new Error('No OAuth URL returned') }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    if (result.type !== 'success' || !result.url) {
      return { error: new Error('Sign in was cancelled or failed') }
    }

    await setSessionFromRedirectUrl(result.url)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e : new Error('Sign in with Apple failed') }
  }
}
