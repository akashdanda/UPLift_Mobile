-- Run in Supabase Dashboard → SQL Editor if the app errors with:
--   "Could not find the 'gym_id' column of 'workouts' in the schema cache"
--
-- Requires: public.gyms and public.gym_presence (see migrations/20260409_gym_map.sql).
-- Safe to run more than once.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_gym_id ON public.workouts(gym_id);

DROP POLICY IF EXISTS "Users can insert own workout" ON public.workouts;
DROP POLICY IF EXISTS "Users can insert own workout when checked in at gym" ON public.workouts;

CREATE POLICY "Users can insert own workout when checked in at gym"
  ON public.workouts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND gym_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.gym_presence gp
      WHERE gp.user_id = auth.uid()
        AND gp.gym_id = gym_id
    )
  );
