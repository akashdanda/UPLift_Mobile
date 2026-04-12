-- Snapshot gym name at post time so feed / today's card can show location even if gym_id join fails.
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS gym_display_name TEXT;

COMMENT ON COLUMN public.workouts.gym_display_name IS 'Gym name when the workout was posted (from check-in context).';
