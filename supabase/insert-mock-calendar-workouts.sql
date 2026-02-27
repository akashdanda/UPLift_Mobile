-- Mock calendar data for App Store screenshot (profile Activity calendar).
-- Run in Supabase Dashboard → SQL Editor (as service role).
--
-- Use the user's UUID (from Authentication → Users or profiles.id), NOT their display name.
-- This script also temporarily sets the profile's created_at to before Feb 1 so every day
-- in February shows as "on or after signup" and all skipped days appear red. Revert restores it.
--
-- 1. Replace the UUID below with that user's real UUID.
-- 2. Run this script, take your screenshot, then run revert-mock-calendar-workouts.sql.

DO $$
DECLARE
  v_user_id UUID := '41cf3002-fc00-4e8c-becb-b13bdc5ec98b';  -- ← change to target user's UUID
  v_placeholder_url TEXT := 'https://placehold.co/400x400/22c55e/white?text=W';
BEGIN
  IF v_user_id = '00000000-0000-0000-0000-000000000000'::UUID THEN
    RAISE EXCEPTION 'Replace v_user_id with the user UUID from Authentication → Users.';
  END IF;

  -- Backup profile created_at so revert can restore it (app only shows "missed" red for days on/after signup)
  CREATE TABLE IF NOT EXISTS public.mock_calendar_backup (
    user_id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL
  );
  INSERT INTO public.mock_calendar_backup (user_id, created_at)
  SELECT id, created_at FROM public.profiles WHERE id = v_user_id
  ON CONFLICT (user_id) DO UPDATE SET created_at = EXCLUDED.created_at;

  UPDATE public.profiles
  SET created_at = '2026-01-15 00:00:00+00'::timestamptz
  WHERE id = v_user_id;

  INSERT INTO public.workouts (user_id, workout_date, image_url, caption)
  VALUES
    (v_user_id, '2026-02-01', v_placeholder_url, NULL),
    (v_user_id, '2026-02-08', v_placeholder_url, NULL),
    (v_user_id, '2026-02-09', v_placeholder_url, NULL),
    (v_user_id, '2026-02-11', v_placeholder_url, NULL),
    (v_user_id, '2026-02-12', v_placeholder_url, NULL),
    (v_user_id, '2026-02-13', v_placeholder_url, NULL),
    (v_user_id, '2026-02-16', v_placeholder_url, NULL),
    (v_user_id, '2026-02-17', v_placeholder_url, NULL),
    (v_user_id, '2026-02-18', v_placeholder_url, NULL),
    (v_user_id, '2026-02-19', v_placeholder_url, NULL),
    (v_user_id, '2026-02-21', v_placeholder_url, NULL),
    (v_user_id, '2026-02-22', v_placeholder_url, NULL)
  ON CONFLICT (user_id, workout_date) DO NOTHING;
END $$;
