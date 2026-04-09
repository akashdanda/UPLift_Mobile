// Supabase Edge Function: send a workout nudge push to a friend (rate-limited).
/// <reference path="./edge-runtime.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

type Payload = {
  target_user_id: string
}

function getTodayUTC(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!auth) return null
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const token = getBearerToken(req)
    if (!token) {
      return new Response(JSON.stringify({ sent: 0, reason: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const { target_user_id } = (await req.json()) as Payload
    if (!target_user_id) {
      return new Response(JSON.stringify({ sent: 0, reason: 'Invalid payload' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ sent: 0, reason: 'Server misconfigured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Service client: use service role to validate caller identity from JWT.
    // (Edge Functions reliably have SUPABASE_SERVICE_ROLE_KEY; SUPABASE_ANON_KEY may not be present.)
    const supabase = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: userRes } = await supabase.auth.getUser()
    const fromUserId = userRes?.user?.id
    if (!fromUserId) {
      return new Response(JSON.stringify({ sent: 0, reason: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (fromUserId === target_user_id) {
      return new Response(JSON.stringify({ sent: 0, reason: 'Cannot nudge self' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Only allow nudging friends.
    const { data: friendship } = await supabase
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${fromUserId},addressee_id.eq.${target_user_id}),and(requester_id.eq.${target_user_id},addressee_id.eq.${fromUserId})`
      )
      .maybeSingle()

    if (!friendship) {
      return new Response(JSON.stringify({ sent: 0, reason: 'Not friends' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Only nudge if they haven't logged a workout today (UTC), matching daily reminders behavior.
    const today = getTodayUTC()
    const { data: workoutToday } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', target_user_id)
      .eq('workout_date', today)
      .limit(1)
      .maybeSingle()

    if (workoutToday) {
      return new Response(JSON.stringify({ sent: 0, reason: 'Already worked out today' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Rate limit: 1 per day (UTC) per sender→receiver.
    // If unique index hits, return 200 and do not send again.
    const { error: insertError } = await supabase.from('workout_nudges').insert({
      from_user_id: fromUserId,
      to_user_id: target_user_id,
    })
    if (insertError) {
      const msg = String(insertError.message ?? '')
      const isDuplicate = msg.includes('workout_nudges_unique_daily') || msg.toLowerCase().includes('duplicate')
      return new Response(JSON.stringify({ sent: 0, reason: isDuplicate ? 'Already nudged today' : msg }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const [{ data: fromProfile }, { data: toProfile }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', fromUserId).maybeSingle(),
      supabase.from('profiles').select('expo_push_token, notifications_enabled').eq('id', target_user_id).maybeSingle(),
    ])

    const name = (fromProfile as { display_name?: string | null } | null)?.display_name || 'Someone'
    const tokenTo = (toProfile as { expo_push_token?: string | null } | null)?.expo_push_token
    const enabled = (toProfile as { notifications_enabled?: boolean } | null)?.notifications_enabled ?? true

    if (!tokenTo || !enabled) {
      return new Response(JSON.stringify({ sent: 0, reason: 'No token or notifications disabled' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const message = {
      to: tokenTo,
      title: 'Uplift',
      body: `${name} nudged you — time to log a workout.`,
      data: { type: 'nudge' },
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([message]),
    })

    if (!res.ok) {
      const text = await res.text()
      return new Response(JSON.stringify({ sent: 0, reason: text }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ sent: 1 }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (e) {
    return new Response(JSON.stringify({ sent: 0, reason: String(e) }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})

