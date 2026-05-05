-- Make `profiles.streak` + `profiles.longest_streak` a single source of truth.
-- Recompute from workouts using the canonical DB functions:
-- - public.get_current_streak(user_id, CURRENT_DATE)  (rest days pause)
-- - public.get_longest_streak(user_id)                (all-time, rest days pause)
--
-- This fixes mismatches where some screens computed streaks client-side while others
-- displayed stale/incorrect stored values.

CREATE OR REPLACE FUNCTION public.recompute_profile_streaks(user_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    streak = public.get_current_streak(user_id_param, CURRENT_DATE),
    longest_streak = public.get_longest_streak(user_id_param)
  WHERE id = user_id_param;
END;
$$;

-- Replace any older streak triggers that only handled INSERT and/or used different semantics.
DROP TRIGGER IF EXISTS on_workout_created_streak ON public.workouts;
DROP FUNCTION IF EXISTS public.update_streak_on_workout();

CREATE OR REPLACE FUNCTION public.trg_recompute_profile_streaks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := COALESCE(NEW.user_id, OLD.user_id);
  IF uid IS NOT NULL THEN
    PERFORM public.recompute_profile_streaks(uid);
  END IF;

  -- If a workout was moved between users (shouldn't happen, but be safe), recompute both.
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF OLD.user_id IS NOT NULL THEN
      PERFORM public.recompute_profile_streaks(OLD.user_id);
    END IF;
    IF NEW.user_id IS NOT NULL THEN
      PERFORM public.recompute_profile_streaks(NEW.user_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_profile_streaks ON public.workouts;
CREATE TRIGGER trg_recompute_profile_streaks
AFTER INSERT OR UPDATE OF workout_date, workout_type, user_id OR DELETE
ON public.workouts
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_profile_streaks();

-- Backfill all users once.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.recompute_profile_streaks(r.id);
  END LOOP;
END;
$$;

