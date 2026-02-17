# send-daily-reminders

Edge Function that sends daily reminder push notifications to users who have not logged a workout today.

## Behavior

- Selects users with `notifications_enabled = true` and a non-null `expo_push_token`.
- Skips users who already have a workout for today (UTC date).
- For each remaining user, builds a message (urgency “X hours left”, friends nudge, or “Post daily”) and sends one push via Expo Push API.

## Deploy

```bash
supabase functions deploy send-daily-reminders
```

Use `--no-verify-jwt` if you will invoke it from a cron job (no Bearer token):

```bash
supabase functions deploy send-daily-reminders --no-verify-jwt
```

## Schedule (cron)

Invoke the function on a schedule (e.g. 9:00 and 18:00 UTC). Two ways:

### Option A: Supabase Dashboard (easiest)

1. Open your project in [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Integrations** → **Cron** (or **Database** → **Cron**). If you don’t see Cron, enable the **pg_cron** and **pg_net** extensions under **Database** → **Extensions**.
3. Click **Create a new cron job**.
4. Configure:
   - **Name:** e.g. `send-daily-reminders-morning`
   - **Schedule:** Cron expression `0 9 * * *` (9:00 UTC daily) or use the natural language option (e.g. “Every day at 9:00 AM UTC”).
   - **Type:** HTTP request (or “Invoke Edge Function” if available).
   - **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders`  
     (Replace `YOUR_PROJECT_REF` with your project ref from the dashboard URL.)
   - **Method:** POST
   - **Headers:** `Content-Type: application/json`, and optionally `Authorization: Bearer YOUR_ANON_KEY` (anon key from **Settings** → **API**; not required if you deployed with `--no-verify-jwt`).
   - **Body:** `{}` or leave empty.
5. Save, then create a second job for 18:00 UTC with schedule `0 18 * * *` if you want an evening reminder.

### Option B: SQL (pg_cron + pg_net)

1. Enable **pg_cron** and **pg_net** in **Database** → **Extensions**.
2. In **SQL Editor**, open and run the script **`supabase/cron-daily-reminders.sql`** in this repo.
3. In that file, replace `YOUR_PROJECT_REF` with your project ref and `YOUR_ANON_KEY` with your anon key (or drop the `Authorization` header if you use `--no-verify-jwt`).

### Option C: External cron (e.g. GitHub Actions, Vercel Cron)

Call the function URL on a schedule with a simple POST:

- **URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders`
- **Method:** POST
- **Headers:** `Content-Type: application/json` (and `Authorization: Bearer YOUR_ANON_KEY` if you did not deploy with `--no-verify-jwt`)
- **Body:** empty or `{}`

Example (curl):  
`curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders" -H "Content-Type: application/json"`

## Env

Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no extra secrets needed for Expo Push (no auth required by default).
