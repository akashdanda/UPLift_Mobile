-- BeReal-style: everyone who can see the feed can see all reactions on those posts.
-- Ensure SELECT allows any authenticated user to read all workout_reactions (so reactions sync for all viewers).

DROP POLICY IF EXISTS "Anyone can read workout reactions" ON public.workout_reactions;
DROP POLICY IF EXISTS "Users can read own reactions" ON public.workout_reactions;

CREATE POLICY "Anyone can read workout reactions"
  ON public.workout_reactions FOR SELECT
  TO authenticated
  USING (true);
