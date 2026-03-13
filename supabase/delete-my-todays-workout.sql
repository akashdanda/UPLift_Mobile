-- Run this in Supabase Dashboard → SQL Editor
-- Your user ID: 520d1b7b-b77b-4e64-b042-6434a169176b

-- Step 1: See your recent workouts (check the workout_date column)
SELECT id, workout_date, caption, created_at
FROM public.workouts
WHERE user_id = '520d1b7b-b77b-4e64-b042-6434a169176b'
ORDER BY workout_date DESC, created_at DESC
LIMIT 5;

-- Step 2: Delete your most recent workout (so you can repost and test double camera)
-- This deletes the latest one regardless of date, so you don't have to worry about timezone.
DELETE FROM public.workouts
WHERE id = (
  SELECT id FROM public.workouts
  WHERE user_id = '520d1b7b-b77b-4e64-b042-6434a169176b'
  ORDER BY workout_date DESC, created_at DESC
  LIMIT 1
);

-- If you get "permission denied" or 0 rows, run this with RLS bypass (Dashboard uses service role by default).
-- If it still fails, the delete policy may not be applied — run migration 20260220000005_workouts_delete_policy.sql first.
