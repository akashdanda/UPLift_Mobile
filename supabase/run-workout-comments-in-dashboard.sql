-- Run this in Supabase Dashboard → SQL Editor → New query
-- Fixes: "could not find the table public.workout_comments in the schema cache"

-- Comments on workout posts (text and/or optional GIF)
CREATE TABLE IF NOT EXISTS public.workout_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT,
  gif_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((message IS NOT NULL AND message != '') OR (gif_url IS NOT NULL AND gif_url != ''))
);

CREATE INDEX IF NOT EXISTS idx_workout_comments_workout_id ON public.workout_comments(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_comments_created_at ON public.workout_comments(workout_id, created_at ASC);

ALTER TABLE public.workout_comments ENABLE ROW LEVEL SECURITY;

-- Read: anyone can see comments on workouts
DROP POLICY IF EXISTS "Anyone can read workout comments" ON public.workout_comments;
CREATE POLICY "Anyone can read workout comments"
  ON public.workout_comments FOR SELECT
  USING (true);

-- Insert: only comment on a friend's workout (not your own)
DROP POLICY IF EXISTS "Friends can comment on friend workout" ON public.workout_comments;
CREATE POLICY "Friends can comment on friend workout"
  ON public.workout_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (SELECT user_id FROM public.workouts WHERE id = workout_id) != auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND (
          (requester_id = auth.uid() AND addressee_id = (SELECT user_id FROM public.workouts WHERE id = workout_id))
          OR (addressee_id = auth.uid() AND requester_id = (SELECT user_id FROM public.workouts WHERE id = workout_id))
        )
    )
  );

-- Delete: only your own comment
DROP POLICY IF EXISTS "Users can delete own comment" ON public.workout_comments;
CREATE POLICY "Users can delete own comment"
  ON public.workout_comments FOR DELETE
  USING (auth.uid() = user_id);
