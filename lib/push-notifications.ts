import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'

import { supabase } from '@/lib/supabase'

/** Look up a user's display name (best-effort, returns 'Someone' on failure). */
async function getDisplayName(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle()
    return (data as { display_name: string | null } | null)?.display_name || 'Someone'
  } catch {
    return 'Someone'
  }
}

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

/**
 * Fire-and-forget helper to send an out-of-app push for an in-app event.
 * The Edge Function will respect notifications_enabled and missing tokens.
 */
export async function sendEventPush(
  targetUserId: string,
  body: string
): Promise<void> {
  try {
    await supabase.functions.invoke('send-event-push', {
      body: {
        target_user_id: targetUserId,
        title: 'Uplift',
        body,
      },
    })
  } catch {
    // Best-effort only; ignore failures so UI isn't blocked
  }
}

/** Push when someone reacts to a workout (includes reactor name + emoji). */
export async function pushReaction(targetUserId: string, reactorUserId: string, emoji: string): Promise<void> {
  const name = await getDisplayName(reactorUserId)
  await sendEventPush(targetUserId, `${name} reacted ${emoji} to your workout.`)
}

/** Push when someone comments on a workout. */
export async function pushComment(targetUserId: string, commenterUserId: string): Promise<void> {
  const name = await getDisplayName(commenterUserId)
  await sendEventPush(targetUserId, `${name} commented on your workout.`)
}

/** Push when someone sends a friend request. */
export async function pushFriendRequest(targetUserId: string, requesterUserId: string): Promise<void> {
  const name = await getDisplayName(requesterUserId)
  await sendEventPush(targetUserId, `${name} sent you a friend request.`)
}

/** Push when someone accepts your friend request. */
export async function pushFriendAccepted(targetUserId: string, accepterUserId: string): Promise<void> {
  const name = await getDisplayName(accepterUserId)
  await sendEventPush(targetUserId, `${name} accepted your friend request.`)
}

/** Push when someone invites you to a group. */
export async function pushGroupInvite(targetUserId: string, inviterUserId: string, groupName: string): Promise<void> {
  const name = await getDisplayName(inviterUserId)
  await sendEventPush(targetUserId, `${name} invited you to join ${groupName}.`)
}

/** Push when the first friend works out today. */
export async function pushFirstFriendWorkout(targetUserId: string, friendName: string): Promise<void> {
  await sendEventPush(targetUserId, `${friendName} just logged a workout. Your turn!`)
}
