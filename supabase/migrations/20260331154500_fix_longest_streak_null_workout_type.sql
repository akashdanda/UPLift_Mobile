-- Fix get_longest_streak: older workouts may have workout_type = NULL.
-- The previous implementation treated workout_type NULL as "missing", which incorrectly broke streaks.
-- Use presence of a workout row (id) to detect missing days, and treat NULL workout_type as non-rest.

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
    SELECT
      s.d,
      w.id AS workout_id,
      w.workout_type
    FROM series s
    LEFT JOIN public.workouts w
      ON w.user_id = user_id_param
     AND w.workout_date = s.d
  ),
  marked AS (
    SELECT
      d,
      workout_id,
      workout_type,
      CASE WHEN workout_id IS NULL THEN 1 ELSE 0 END AS is_missing,
      SUM(CASE WHEN workout_id IS NULL THEN 1 ELSE 0 END) OVER (ORDER BY d) AS grp
    FROM joined
  ),
  seg AS (
    SELECT
      grp,
      SUM(
        CASE
          WHEN workout_id IS NOT NULL AND (workout_type IS NULL OR workout_type != 'rest') THEN 1
          ELSE 0
        END
      )::integer AS workout_days
    FROM marked
    GROUP BY grp
  )
  SELECT COALESCE(MAX(workout_days), 0)::integer FROM seg;
$$;

GRANT EXECUTE ON FUNCTION public.get_longest_streak(UUID) TO authenticated;

