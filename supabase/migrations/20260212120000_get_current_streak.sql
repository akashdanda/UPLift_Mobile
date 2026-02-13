-- Compute current streak from workout history using a reference date (e.g. client's local "today").
-- This avoids timezone bugs: app passes YYYY-MM-DD for "today" in the user's timezone.
CREATE OR REPLACE FUNCTION public.get_current_streak(user_id_param UUID, reference_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d DATE;
  streak_count INTEGER := 0;
BEGIN
  d := reference_date;
  -- Count consecutive days backward from reference_date that have a workout
  WHILE EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id = user_id_param AND workout_date = d
  ) LOOP
    streak_count := streak_count + 1;
    d := d - INTERVAL '1 day';
  END LOOP;
  RETURN streak_count;
END;
$$;

-- Allow authenticated users to call the function
GRANT EXECUTE ON FUNCTION public.get_current_streak(UUID, DATE) TO authenticated;
