import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'

import { supabase } from '@/lib/supabase'

/** EAS project ID required for Expo Push Token. From app config extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID. */
function getExpoProjectId(): string | undefined {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  const id = fromConfig ?? fromEnv
  if (!id || id === 'YOUR_EAS_PROJECT_ID') return undefined
  return id
}

// Show notifications when app is in foreground (optional: set to false to only show when backgrounded)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * Request permission and get Expo Push Token. Returns null if not a physical device,
 * permission denied, or token fetch fails. Call when user is logged in and save the token to profile.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    if (__DEV__) console.warn('[Push] Not a physical device; push token skipped.')
    return null
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let status = existingStatus
  if (existingStatus !== 'granted') {
    const { status: newStatus } = await Notifications.requestPermissionsAsync()
    status = newStatus
  }
  if (status !== 'granted') {
    if (__DEV__) console.warn('[Push] Permission denied or not determined.')
    return null
  }

  try {
    const projectId = getExpoProjectId()
    if (!projectId) {
      if (__DEV__) {
        console.warn(
          '[Push] No EAS projectId. Run `npx eas init` to link the project, or set extra.eas.projectId in app.json.'
        )
      }
      return null
    }
    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId,
    })
    return tokenResult.data
  } catch (e) {
    if (__DEV__) console.warn('[Push] getExpoPushTokenAsync failed:', e)
    return null
  }
}

/**
 * Save the Expo Push Token to the current user's profile so the backend can send daily reminder pushes.
 */
export async function savePushTokenToProfile(userId: string, token: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token, updated_at: new Date().toISOString() })
    .eq('id', userId)
  return { error: error ? new Error(error.message) : null }
}

/**
 * Clear the push token from profile (e.g. when user disables notifications).
 */
export async function clearPushTokenFromProfile(userId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  return { error: error ? new Error(error.message) : null }
}
