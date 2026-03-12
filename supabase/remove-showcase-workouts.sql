-- Run this in Supabase Dashboard → SQL Editor
-- Removes the showcase workouts created for the App Store screenshot

-- Drop the helper function if it exists
DROP FUNCTION IF EXISTS public.insert_showcase_workouts(UUID, DATE);

-- Find the user by display_name and delete showcase workouts
DO $$
DECLARE
  user_uuid UUID;
  deleted_count INTEGER;
BEGIN
  -- Get user ID (try multiple variations)
  SELECT id INTO user_uuid
  FROM public.profiles
  WHERE LOWER(display_name) = 'jonahhh_'
     OR LOWER(display_name) = 'jonahhh'
     OR LOWER(full_name) = 'jonahhh_'
     OR LOWER(full_name) = 'jonahhh'
  LIMIT 1;

  IF user_uuid IS NULL THEN
    RAISE EXCEPTION 'User "Jonahhh_" not found';
  END IF;

  -- Delete showcase workouts (workouts with the placeholder image or "Showcase workout" caption from last 15 days)
  DELETE FROM public.workouts
  WHERE user_id = user_uuid
    AND workout_date >= CURRENT_DATE - INTERVAL '15 days'
    AND (
      image_url LIKE '%placeholder%'
      OR caption = 'Showcase workout'
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Update user's workouts_count
  UPDATE public.profiles
  SET workouts_count = (
    SELECT COUNT(*)
    FROM public.workouts
    WHERE user_id = user_uuid
  )
  WHERE id = user_uuid;

  RAISE NOTICE 'Deleted % showcase workouts for user Jonahhh_', deleted_count;
END $$;

-- Verification query
SELECT 
  p.display_name,
  p.workouts_count,
  COUNT(w.id) as actual_workouts,
  MIN(w.workout_date) as earliest_workout,
  MAX(w.workout_date) as latest_workout
FROM public.profiles p
LEFT JOIN public.workouts w ON w.user_id = p.id
WHERE LOWER(p.display_name) = 'jonahhh_'
GROUP BY p.id, p.display_name, p.workouts_count;
