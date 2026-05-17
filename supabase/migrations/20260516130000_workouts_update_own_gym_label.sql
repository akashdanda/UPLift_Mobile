-- Allow users to backfill gym_display_label on their own posts (client runs after feed load).

DROP POLICY IF EXISTS "Users can update own workouts" ON public.workouts;

CREATE POLICY "Users can update own workouts"
  ON public.workouts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
