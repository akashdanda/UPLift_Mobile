-- Add longest_streak to profiles (best streak of all time)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.longest_streak IS 'Longest consecutive workout streak ever achieved (all time).';

-- Backfill: set longest_streak to at least current streak for existing users
UPDATE public.profiles
SET longest_streak = GREATEST(COALESCE(longest_streak, 0), COALESCE(streak, 0))
WHERE longest_streak < COALESCE(streak, 0) OR longest_streak IS NULL;

-- Update the streak trigger to also maintain longest_streak
CREATE OR REPLACE FUNCTION public.update_streak_on_workout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yesterday_date DATE;
  has_workout_yesterday BOOLEAN;
BEGIN
  yesterday_date := NEW.workout_date - INTERVAL '1 day';

  SELECT EXISTS(
    SELECT 1
    FROM public.workouts
    WHERE user_id = NEW.user_id
    AND workout_date = yesterday_date
  ) INTO has_workout_yesterday;

  IF has_workout_yesterday THEN
    UPDATE public.profiles
    SET
      streak = streak + 1,
      longest_streak = GREATEST(COALESCE(longest_streak, 0), streak + 1)
    WHERE id = NEW.user_id;
  ELSE
    UPDATE public.profiles
    SET
      streak = 1,
      longest_streak = GREATEST(COALESCE(longest_streak, 0), 1)
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;
