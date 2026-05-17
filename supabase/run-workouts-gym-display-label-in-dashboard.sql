-- Run in Supabase Dashboard → SQL Editor if feed posts are missing gym location for other users.
-- Safe to run more than once.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS gym_display_label TEXT;

UPDATE public.workouts w
SET gym_display_label = CASE
  WHEN TRIM(COALESCE(g.address, '')) <> '' THEN TRIM(g.name) || ' · ' || TRIM(g.address)
  ELSE TRIM(g.name)
END
FROM public.gyms g
WHERE w.gym_id = g.id
  AND (w.gym_display_label IS NULL OR TRIM(w.gym_display_label) = '')
  AND TRIM(COALESCE(g.name, '')) <> '';

DROP POLICY IF EXISTS "Users can update own workouts" ON public.workouts;

CREATE POLICY "Users can update own workouts"
  ON public.workouts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
