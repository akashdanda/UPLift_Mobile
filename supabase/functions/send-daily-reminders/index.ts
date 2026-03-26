// Supabase Edge Function: send daily reminder push notifications to users who haven't posted today.
// Schedule via Supabase cron (e.g. 9:00 and 18:00 UTC) or call via HTTP.
/// <reference path="./edge-runtime.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function getTodayUTC(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}


function getMessage(): string {
  const now = new Date()
  const hour = now.getUTCHours()
  if (hour < 22) {
    return "Don't forget to log your workout today!"
  }
  return "You still haven't worked out today. Don't break your streak!"
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const today = getTodayUTC()

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

    const body = getMessage()

    const messages: { to: string; title: string; body: string }[] = []
    type ProfileRow = { id: string; expo_push_token: string | null }
    for (const p of profiles as ProfileRow[]) {
      const token = p.expo_push_token
      if (!token) continue
      if (postedTodayIds.has(p.id)) continue
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
