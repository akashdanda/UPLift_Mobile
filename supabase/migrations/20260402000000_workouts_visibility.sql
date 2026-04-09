-- Add visibility column: 'friends' (default, only friends see it) or 'public' (everyone sees it)
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'friends'
  CHECK (visibility IN ('friends', 'public'));

CREATE INDEX IF NOT EXISTS idx_workouts_visibility ON public.workouts (visibility)
  WHERE visibility = 'public';
