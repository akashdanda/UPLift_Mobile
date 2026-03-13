-- Workout type: cardio, strength, sport, rest (active rest day)
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS workout_type TEXT NOT NULL DEFAULT 'strength'
  CHECK (workout_type IN ('cardio', 'strength', 'sport', 'rest'));

COMMENT ON COLUMN public.workouts.workout_type IS 'cardio | strength | sport | rest. Rest = active rest day: pauses streak, max 2 per week.';

-- Streak: rest day does not increment or break streak (pause only)
CREATE OR REPLACE FUNCTION public.update_streak_on_workout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yesterday_date DATE;
  has_non_rest_yesterday BOOLEAN;
BEGIN
  -- Active rest day: do not change streak
  IF NEW.workout_type = 'rest' THEN
    RETURN NEW;
  END IF;

  yesterday_date := NEW.workout_date - INTERVAL '1 day';

  -- Only non-rest workouts count for "yesterday" when continuing streak
  SELECT EXISTS(
    SELECT 1
    FROM public.workouts
    WHERE user_id = NEW.user_id
      AND workout_date = yesterday_date
      AND (workout_type IS NULL OR workout_type != 'rest')
  ) INTO has_non_rest_yesterday;

  IF has_non_rest_yesterday THEN
    UPDATE public.profiles
    SET streak = streak + 1
    WHERE id = NEW.user_id;
  ELSE
    UPDATE public.profiles
    SET streak = 1
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- get_current_streak: only count consecutive days with a non-rest workout
CREATE OR REPLACE FUNCTION public.get_current_streak(user_id_param UUID, reference_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d DATE;
  last_non_rest_date DATE;
  streak_count INTEGER := 0;
BEGIN
  -- Most recent date on or before reference_date that has a non-rest workout
  SELECT MAX(workout_date)
  INTO last_non_rest_date
  FROM public.workouts
  WHERE user_id = user_id_param
    AND workout_date <= reference_date
    AND (workout_type IS NULL OR workout_type != 'rest');

  IF last_non_rest_date IS NULL THEN
    RETURN 0;
  END IF;

  IF reference_date - last_non_rest_date > 1 THEN
    RETURN 0;
  END IF;

  d := last_non_rest_date;
  WHILE EXISTS (
    SELECT 1 FROM public.workouts
    WHERE user_id = user_id_param
      AND workout_date = d
      AND (workout_type IS NULL OR workout_type != 'rest')
  ) LOOP
    streak_count := streak_count + 1;
    d := d - INTERVAL '1 day';
  END LOOP;

  RETURN streak_count;
END;
$$;

-- check_and_reset_streak: having only a rest workout today still counts as "no workout" for reset
CREATE OR REPLACE FUNCTION public.check_and_reset_streak(user_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date DATE;
  has_non_rest_today BOOLEAN;
BEGIN
  today_date := CURRENT_DATE;

  SELECT EXISTS(
    SELECT 1
    FROM public.workouts
    WHERE user_id = user_id_param
      AND workout_date = today_date
      AND (workout_type IS NULL OR workout_type != 'rest')
  ) INTO has_non_rest_today;

  IF NOT has_non_rest_today THEN
    UPDATE public.profiles
    SET streak = 0
    WHERE id = user_id_param;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_streak(UUID, DATE) TO authenticated;
