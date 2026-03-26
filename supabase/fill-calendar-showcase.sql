-- Run this in Supabase Dashboard → SQL Editor
-- Fills out the calendar for user "Jonahhh_" with 15 days of workouts
-- Mix of green (workouts) and red (missed days) for App Store showcase

-- Create a function to insert workouts that bypasses RLS
CREATE OR REPLACE FUNCTION public.insert_showcase_workouts(p_user_id UUID, p_workout_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workouts (
    id,
    user_id,
    workout_date,
    image_url,
    caption,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    p_workout_date,
    'https://via.placeholder.com/400x400/7C3AED/FFFFFF?text=Workout',
    'Showcase workout',
    NOW()
  )
  ON CONFLICT (user_id, workout_date) DO NOTHING;
END;
$$;

-- First, let's verify the user exists
SELECT id, display_name, full_name 
FROM public.profiles 
WHERE LOWER(display_name) LIKE '%jonah%' 
   OR LOWER(full_name) LIKE '%jonah%';

-- Find the user by display_name and create workouts
DO $$
DECLARE
  user_uuid UUID;
  start_date DATE;
  workout_dates DATE[] := ARRAY[]::DATE[];
  date_to_insert DATE;
  inserted_count INTEGER := 0;
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
    RAISE EXCEPTION 'User "Jonahhh_" not found. Check the query above to see available users.';
  END IF;

  RAISE NOTICE 'Found user: %', user_uuid;

  -- Create workout dates pattern (going back from today)
  -- Pattern: workout, workout, missed, workout, workout, workout, missed, missed, workout, workout, workout, workout, missed, workout, workout
  -- This creates a nice mix of green and red days
  
  -- Start from 15 days ago
  start_date := CURRENT_DATE - INTERVAL '15 days';
  
  -- Day 1-2: workouts (green)
  workout_dates := workout_dates || (start_date + INTERVAL '0 days');
  workout_dates := workout_dates || (start_date + INTERVAL '1 days');
  -- Day 3: missed (red - will show because days 1-2 have workouts)
  
  -- Day 4-6: workouts (green)
  workout_dates := workout_dates || (start_date + INTERVAL '3 days');
  workout_dates := workout_dates || (start_date + INTERVAL '4 days');
  workout_dates := workout_dates || (start_date + INTERVAL '5 days');
  -- Day 7-8: missed (red)
  
  -- Day 9-12: workouts (green)
  workout_dates := workout_dates || (start_date + INTERVAL '8 days');
  workout_dates := workout_dates || (start_date + INTERVAL '9 days');
  workout_dates := workout_dates || (start_date + INTERVAL '10 days');
  workout_dates := workout_dates || (start_date + INTERVAL '11 days');
  -- Day 13: missed (red)
  
  -- Day 14-15: workouts (green)
  workout_dates := workout_dates || (start_date + INTERVAL '13 days');
  workout_dates := workout_dates || (start_date + INTERVAL '14 days');

  -- Insert workouts for each date
  FOREACH date_to_insert IN ARRAY workout_dates
  LOOP
    -- Check if workout already exists for this date
    IF NOT EXISTS (
      SELECT 1 FROM public.workouts
      WHERE user_id = user_uuid
        AND workout_date = date_to_insert
    ) THEN
      BEGIN
        -- Use the SECURITY DEFINER function to bypass RLS
        PERFORM public.insert_showcase_workouts(user_uuid, date_to_insert);
        inserted_count := inserted_count + 1;
        RAISE NOTICE 'Inserted workout for date: %', date_to_insert;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to insert workout for date %: %', date_to_insert, SQLERRM;
      END;
    ELSE
      RAISE NOTICE 'Workout already exists for date: %', date_to_insert;
    END IF;
  END LOOP;

  -- Update user's workouts_count
  UPDATE public.profiles
  SET workouts_count = (
    SELECT COUNT(*)
    FROM public.workouts
    WHERE user_id = user_uuid
  )
  WHERE id = user_uuid;

  RAISE NOTICE 'Successfully inserted % workouts for user Jonahhh_', inserted_count;
  RAISE NOTICE 'Total workout dates in pattern: %', array_length(workout_dates, 1);
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
