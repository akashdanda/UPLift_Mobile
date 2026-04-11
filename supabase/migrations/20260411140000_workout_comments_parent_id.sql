-- Threaded replies: optional parent comment (same workout).
ALTER TABLE public.workout_comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.workout_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_workout_comments_parent_id ON public.workout_comments(parent_id)
  WHERE parent_id IS NOT NULL;
