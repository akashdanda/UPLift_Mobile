-- Streak logic: rest days pause streak (don't increment, don't break).
-- This function should match the calendar semantics:
-- - A day is "active" if the user posted either a workout or a rest day.
-- - A streak counts only non-rest workouts.
-- - Rest days allow continuation across gaps (workout, rest, workout still counts).
-- - Missing *today* does not break the streak yet; it breaks only after a full missed day.

CREATE OR REPLACE FUNCTION public.get_current_streak(user_id_param UUID, reference_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d DATE;
  wt TEXT;
  streak_count INTEGER := 0;
BEGIN
  -- Start from reference_date, but if there's no entry today, allow a grace day (yesterday)
  -- so the streak doesn't drop to 0 mid-day.
  d := reference_date;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workouts
    WHERE user_id = user_id_param
      AND workout_date = d
  ) THEN
    d := d - INTERVAL '1 day';
  END IF;

  LOOP
    SELECT workout_type
    INTO wt
    FROM public.workouts
    WHERE user_id = user_id_param
      AND workout_date = d
    LIMIT 1;

    IF NOT FOUND THEN
      EXIT;
    END IF;

    IF wt IS NULL OR wt != 'rest' THEN
      streak_count := streak_count + 1;
    END IF;

    d := d - INTERVAL '1 day';
  END LOOP;

  RETURN streak_count;
END;
$$;

-- Longest streak (all-time), with the same rest-day pause semantics.
CREATE OR REPLACE FUNCTION public.get_longest_streak(user_id_param UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT MIN(workout_date) AS min_d, MAX(workout_date) AS max_d
    FROM public.workouts
    WHERE user_id = user_id_param
  ),
  series AS (
    SELECT gs::date AS d
    FROM bounds b, generate_series(b.min_d, b.max_d, interval '1 day') gs
    WHERE b.min_d IS NOT NULL AND b.max_d IS NOT NULL
  ),
  joined AS (
    SELECT s.d, w.workout_type
    FROM series s
    LEFT JOIN public.workouts w
      ON w.user_id = user_id_param
     AND w.workout_date = s.d
  ),
  marked AS (
    SELECT
      d,
      workout_type,
      CASE WHEN workout_type IS NULL THEN 1 ELSE 0 END AS is_missing,
      SUM(CASE WHEN workout_type IS NULL THEN 1 ELSE 0 END) OVER (ORDER BY d) AS grp
    FROM joined
  ),
  seg AS (
    SELECT
      grp,
      SUM(CASE WHEN workout_type IS NOT NULL AND workout_type != 'rest' THEN 1 ELSE 0 END)::integer AS workout_days
    FROM marked
    GROUP BY grp
  )
  SELECT COALESCE(MAX(workout_days), 0)::integer FROM seg;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_streak(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_longest_streak(UUID) TO authenticated;

