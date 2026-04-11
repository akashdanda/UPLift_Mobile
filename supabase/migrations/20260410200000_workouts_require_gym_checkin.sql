-- Tie new workout posts to the gym the user is checked in at (gym_presence).
-- Legacy rows may have gym_id NULL; new inserts require a matching check-in.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES public.gyms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_gym_id ON public.workouts(gym_id);

DROP POLICY IF EXISTS "Users can insert own workout" ON public.workouts;

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
