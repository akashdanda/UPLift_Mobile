-- Update get_current_streak to treat "today" as not breaking your streak
-- unless you've already missed at least one full day.
--
-- Behavior:
-- - Streak is based on the most recent workout date that is at most reference_date.
-- - If your last workout was today → streak counts back from today (unchanged).
-- - If your last workout was yesterday → streak still counts back from yesterday, so you
--   keep your streak during the current day until it actually passes.
-- - If your last workout was 2+ days before reference_date → streak is 0 (streak broken).
--
-- To apply this in Supabase:
-- 1. Open Supabase Dashboard → SQL Editor
-- 2. Paste this entire script
-- 3. Run it once

CREATE OR REPLACE FUNCTION public.get_current_streak(user_id_param UUID, reference_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d DATE;
  last_workout_date DATE;
  streak_count INTEGER := 0;
BEGIN
  -- Find the most recent workout on or before the reference date
  SELECT MAX(workout_date)
  INTO last_workout_date
  FROM public.workouts
  WHERE user_id = user_id_param
    AND workout_date <= reference_date;

  -- No workouts at all
  IF last_workout_date IS NULL THEN
    RETURN 0;
  END IF;

  -- If the last workout was more than 1 day before reference_date,
  -- the streak is already broken (you missed at least one full day).
  IF reference_date - last_workout_date > 1 THEN
    RETURN 0;
  END IF;

  -- Count consecutive days backward from the last workout date
  d := last_workout_date;
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

GRANT EXECUTE ON FUNCTION public.get_current_streak(UUID, DATE) TO authenticated;

