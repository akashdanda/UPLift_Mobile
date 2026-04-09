-- Workout nudges: allow users to nudge friends (rate-limited).
-- This table is written by an Edge Function using the service role key.

CREATE TABLE IF NOT EXISTS public.workout_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Stored UTC "day" so we can create an immutable unique index for rate limiting.
  created_date_utc date GENERATED ALWAYS AS (((created_at AT TIME ZONE 'UTC')::date)) STORED
);

-- Rate limit: at most one nudge per sender→receiver per calendar day (UTC).
CREATE UNIQUE INDEX IF NOT EXISTS workout_nudges_unique_daily
  ON public.workout_nudges (from_user_id, to_user_id, created_date_utc);

ALTER TABLE public.workout_nudges ENABLE ROW LEVEL SECURITY;

-- Nobody should read nudges directly from the client.
DROP POLICY IF EXISTS "No read workout nudges" ON public.workout_nudges;
CREATE POLICY "No read workout nudges"
  ON public.workout_nudges
  FOR SELECT
  USING (false);

-- Nobody should write nudges directly from the client.
DROP POLICY IF EXISTS "No write workout nudges" ON public.workout_nudges;
CREATE POLICY "No write workout nudges"
  ON public.workout_nudges
  FOR INSERT
  WITH CHECK (false);

