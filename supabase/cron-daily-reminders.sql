-- Schedule the send-daily-reminders Edge Function to run at 9:00 and 18:00 UTC every day.
-- Run this once in Supabase Dashboard → SQL Editor (replace placeholders first).
--
-- Prerequisites:
-- 1. Enable "pg_cron" and "pg_net" in Dashboard → Database → Extensions.
-- 2. Deploy the function: supabase functions deploy send-daily-reminders --no-verify-jwt
--
-- Replace:
--   YOUR_PROJECT_REF  → from Dashboard URL, e.g. abcdefghijklmnop
--   YOUR_ANON_KEY     → Dashboard → Settings → API → anon public (optional if you use --no-verify-jwt)

-- Run at 9:00 UTC every day
SELECT cron.schedule(
  'send-daily-reminders-morning',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

-- Run at 18:00 UTC every day (6 PM UTC)
SELECT cron.schedule(
  'send-daily-reminders-evening',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_KEY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

-- To remove the jobs later:
-- SELECT cron.unschedule('send-daily-reminders-morning');
-- SELECT cron.unschedule('send-daily-reminders-evening');
