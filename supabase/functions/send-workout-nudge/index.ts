// Supabase Edge Function: send a workout nudge push to a friend (rate-limited).
/// <reference path="./edge-runtime.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ sent: 0, reason: 'Method not allowed' })
  }

  try {
    const token = getBearerToken(req)
    if (!token) {
      return json({ sent: 0, reason: 'Unauthorized' })
    }

    const { target_user_id } = (await req.json()) as Payload
    if (!target_user_id) {
      return json({ sent: 0, reason: 'Invalid payload' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceKey) {
      return json({ sent: 0, reason: 'Server misconfigured' })
    }

    // User client: only used to verify caller identity from JWT
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    // Service client: bypasses RLS for all DB operations
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: userRes } = await userClient.auth.getUser()
    const fromUserId = userRes?.user?.id
    if (!fromUserId) {
      return json({ sent: 0, reason: 'Unauthorized' })
    }

    if (fromUserId === target_user_id) {
      return json({ sent: 0, reason: 'Cannot nudge self' })
    }

    const { data: friendship } = await supabase
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${fromUserId},addressee_id.eq.${target_user_id}),and(requester_id.eq.${target_user_id},addressee_id.eq.${fromUserId})`
      )
      .maybeSingle()

    if (!friendship) {
      return json({ sent: 0, reason: 'Not friends' })
    }

    const today = getTodayUTC()
    const { data: workoutToday } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', target_user_id)
      .eq('workout_date', today)
      .limit(1)
      .maybeSingle()

    if (workoutToday) {
      return json({ sent: 0, reason: 'Already worked out today' })
    }

    const { error: insertError } = await supabase.from('workout_nudges').insert({
      from_user_id: fromUserId,
      to_user_id: target_user_id,
    })
    if (insertError) {
      const msg = String(insertError.message ?? '')
      const isDuplicate = msg.includes('workout_nudges_unique_daily') || msg.toLowerCase().includes('duplicate')
      return json({ sent: 0, reason: isDuplicate ? 'Already nudged today' : msg })
    }

    const [{ data: fromProfile }, { data: toProfile }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', fromUserId).maybeSingle(),
      supabase.from('profiles').select('expo_push_token, notifications_enabled').eq('id', target_user_id).maybeSingle(),
    ])

    const name = (fromProfile as { display_name?: string | null } | null)?.display_name || 'Someone'
    const tokenTo = (toProfile as { expo_push_token?: string | null } | null)?.expo_push_token
    const enabled = (toProfile as { notifications_enabled?: boolean } | null)?.notifications_enabled ?? true

    if (!tokenTo || !enabled) {
      return json({ sent: 0, reason: 'No token or notifications disabled' })
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
      return json({ sent: 0, reason: text })
    }

    return json({ sent: 1 })
  } catch (e) {
    return json({ sent: 0, reason: String(e) })
  }
})
