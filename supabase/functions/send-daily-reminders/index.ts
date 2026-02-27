// Supabase Edge Function: send daily reminder push notifications to users who haven't posted today.
// Schedule via Supabase cron (e.g. 9:00 and 18:00 UTC) or call via HTTP.
/// <reference path="./edge-runtime.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function getTodayUTC(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function getHoursLeftUntil4AMUTC(): number {
  const now = new Date()
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    4, 0, 0, 0
  ))
  const ms = tomorrow.getTime() - now.getTime()
  return ms > 0 ? Math.floor(ms / (60 * 60 * 1000)) : 0
}

function getMessage(hasPostedToday: boolean, friendsPostedCount: number, hoursLeft: number): string {
  if (hasPostedToday) return ''
  if (hoursLeft > 0 && hoursLeft <= 3) {
    return hoursLeft <= 1
      ? "1 hour left to post today. Don't fall behind."
      : `${hoursLeft} hours left to post today. Don't fall behind.`
  }
  if (friendsPostedCount >= 1) {
    const n = friendsPostedCount
    const verb = n === 1 ? 'has' : 'have'
    const word = n === 1 ? 'workout' : 'workouts'
    return `${n} of your friends ${verb} already logged their ${word} today. Don't fall behind.`
  }
  return 'Post daily — log a workout to keep your streak.'
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const today = getTodayUTC()
    const hoursLeft = getHoursLeftUntil4AMUTC()

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, expo_push_token')
      .eq('notifications_enabled', true)
      .not('expo_push_token', 'is', null)

    if (!profiles?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No users with push tokens' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const userIds = profiles.map((p) => p.id)
    const { data: workoutsToday } = await supabase
      .from('workouts')
      .select('user_id')
      .eq('workout_date', today)
      .in('user_id', userIds)

    const postedTodayIds = new Set((workoutsToday ?? []).map((r: { user_id: string }) => r.user_id))

    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')

    const friendIdsByUser = new Map<string, Set<string>>()
    for (const f of friendships ?? []) {
      const a = (f as { requester_id: string; addressee_id: string }).requester_id
      const b = (f as { requester_id: string; addressee_id: string }).addressee_id
      if (!friendIdsByUser.has(a)) friendIdsByUser.set(a, new Set())
      if (!friendIdsByUser.has(b)) friendIdsByUser.set(b, new Set())
      friendIdsByUser.get(a)!.add(b)
      friendIdsByUser.get(b)!.add(a)
    }

    const { data: allWorkoutsToday } = await supabase
      .from('workouts')
      .select('user_id')
      .eq('workout_date', today)
    const userIdsWhoPosted = new Set((allWorkoutsToday ?? []).map((r: { user_id: string }) => r.user_id))

    const messages: { to: string; title: string; body: string }[] = []
    type ProfileRow = { id: string; expo_push_token: string | null }
    for (const p of profiles as ProfileRow[]) {
      const token = p.expo_push_token
      if (!token) continue
      if (postedTodayIds.has(p.id)) continue
      const friendIds = friendIdsByUser.get(p.id)
      let friendsPostedCount = 0
      if (friendIds) {
        for (const fid of friendIds) {
          if (userIdsWhoPosted.has(fid)) friendsPostedCount++
        }
      }
      const body = getMessage(false, friendsPostedCount, hoursLeft)
      if (!body) continue
      messages.push({ to: token, title: 'Uplift', body })
    }

    let sent = 0
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100)
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      })
      if (res.ok) sent += batch.length
    }

    return new Response(JSON.stringify({ sent, total: messages.length }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
