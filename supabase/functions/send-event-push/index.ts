// Supabase Edge Function: send a single event-based push notification.
// Call this when something happens (reaction, comment, group invite, duel update).
/// <reference path="./edge-runtime.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

type EventPushPayload = {
  target_user_id: string
  title: string
  body: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload = (await req.json()) as EventPushPayload
    if (!payload?.target_user_id || !payload?.title || !payload?.body) {
      return new Response('Invalid payload', { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token, notifications_enabled')
      .eq('id', payload.target_user_id)
      .maybeSingle()

    const token = (profile as { expo_push_token?: string | null; notifications_enabled?: boolean } | null)
      ?.expo_push_token
    const enabled = (profile as { notifications_enabled?: boolean } | null)?.notifications_enabled ?? true

    if (!token || !enabled) {
      return new Response(JSON.stringify({ sent: 0, reason: 'No token or notifications disabled' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const message = {
      to: token,
      title: 'Uplift',
      body: payload.body,
      data: { type: 'event', title: payload.title },
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([message]),
    })

    if (!res.ok) {
      const text = await res.text()
      return new Response(JSON.stringify({ sent: 0, error: text }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    return new Response(JSON.stringify({ sent: 1 }), {
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

