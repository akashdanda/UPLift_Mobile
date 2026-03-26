-- Schedule the send-daily-reminders Edge Function at 2 PM and 7 PM (US Central / CDT = UTC-5).
-- Adjust the UTC hours below if your users are in a different timezone.
-- Run this once in Supabase Dashboard → SQL Editor (replace placeholders first).
--
-- Prerequisites:
-- 1. Enable "pg_cron" and "pg_net" in Dashboard → Database → Extensions.
-- 2. Deploy the function: supabase functions deploy send-daily-reminders --no-verify-jwt
--
-- Replace:
--   YOUR_PROJECT_REF  → from Dashboard URL, e.g. abcdefghijklmnop
--   YOUR_ANON_KEY     → Dashboard → Settings → API → anon public (optional if you use --no-verify-jwt)

-- 2 PM CDT = 19:00 UTC
SELECT cron.schedule(
  'send-daily-reminders-afternoon',
  '0 19 * * *',
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

-- 7 PM CDT = 00:00 UTC (next day)
SELECT cron.schedule(
  'send-daily-reminders-evening',
  '0 0 * * *',
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

-- To remove old jobs (if you had the previous schedule):
-- SELECT cron.unschedule('send-daily-reminders-morning');
-- To remove these jobs later:
-- SELECT cron.unschedule('send-daily-reminders-afternoon');
-- SELECT cron.unschedule('send-daily-reminders-evening');
