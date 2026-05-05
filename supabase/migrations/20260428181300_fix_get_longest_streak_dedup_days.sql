-- Fix get_longest_streak to avoid overcounting when multiple workouts exist on the same date.
-- We collapse workouts into a per-day "has_non_rest" flag:
-- - day is present if any workout row exists that day
-- - day counts toward streak if any non-rest workout exists that day
-- - rest days pause (present but does not increment streak)

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
  per_day AS (
    SELECT
      w.workout_date AS d,
      TRUE AS has_row,
      -- Treat NULL workout_type as non-rest (legacy rows)
      BOOL_OR(w.workout_type IS NULL OR w.workout_type != 'rest') AS has_non_rest
    FROM public.workouts w
    WHERE w.user_id = user_id_param
    GROUP BY w.workout_date
  ),
  joined AS (
    SELECT
      s.d,
      COALESCE(p.has_row, FALSE) AS has_row,
      COALESCE(p.has_non_rest, FALSE) AS has_non_rest
    FROM series s
    LEFT JOIN per_day p ON p.d = s.d
  ),
  marked AS (
    SELECT
      d,
      has_row,
      has_non_rest,
      CASE WHEN has_row = FALSE THEN 1 ELSE 0 END AS is_missing,
      SUM(CASE WHEN has_row = FALSE THEN 1 ELSE 0 END) OVER (ORDER BY d) AS grp
    FROM joined
  ),
  seg AS (
    SELECT
      grp,
      SUM(CASE WHEN has_row = TRUE AND has_non_rest = TRUE THEN 1 ELSE 0 END)::integer AS workout_days
    FROM marked
    GROUP BY grp
  )
  SELECT COALESCE(MAX(workout_days), 0)::integer FROM seg;
$$;

GRANT EXECUTE ON FUNCTION public.get_longest_streak(UUID) TO authenticated;

