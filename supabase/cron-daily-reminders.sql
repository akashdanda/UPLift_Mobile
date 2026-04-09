-- Schedule the send-daily-reminders Edge Function at 2 PM and 7 PM (US Central / CDT = UTC-5).
-- Run this once in Supabase Dashboard → SQL Editor.
--
-- Prerequisites:
-- 1. Enable "pg_cron" and "pg_net" in Dashboard → Database → Extensions.
-- 2. Deploy the function: supabase functions deploy send-daily-reminders --no-verify-jwt

-- 2 PM CDT = 19:00 UTC
SELECT cron.schedule(
  'send-daily-reminders-afternoon',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://huhnhfaeczdejzjrgtkf.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
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
    url := 'https://huhnhfaeczdejzjrgtkf.supabase.co/functions/v1/send-daily-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

-- To remove these jobs later:
-- SELECT cron.unschedule('send-daily-reminders-afternoon');
-- SELECT cron.unschedule('send-daily-reminders-evening');
