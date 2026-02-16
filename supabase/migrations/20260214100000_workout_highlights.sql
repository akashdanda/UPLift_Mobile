-- Instagram-style workout highlights: users curate workouts into named collections shown on profile.

CREATE TABLE IF NOT EXISTS public.workout_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cover_workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_highlights_user_id ON public.workout_highlights(user_id);

CREATE TABLE IF NOT EXISTS public.workout_highlight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id UUID NOT NULL REFERENCES public.workout_highlights(id) ON DELETE CASCADE,
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(highlight_id, workout_id)
);

CREATE INDEX IF NOT EXISTS idx_workout_highlight_items_highlight_id ON public.workout_highlight_items(highlight_id);

ALTER TABLE public.workout_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_highlight_items ENABLE ROW LEVEL SECURITY;

-- Highlights: anyone can read (for profile); user can manage own
DROP POLICY IF EXISTS "Anyone can read highlights" ON public.workout_highlights;
CREATE POLICY "Anyone can read highlights"
  ON public.workout_highlights FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage own highlights" ON public.workout_highlights;
CREATE POLICY "Users can manage own highlights"
  ON public.workout_highlights FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Highlight items: anyone can read; user can manage (only for own highlights, only own workouts)
DROP POLICY IF EXISTS "Anyone can read highlight items" ON public.workout_highlight_items;
CREATE POLICY "Anyone can read highlight items"
  ON public.workout_highlight_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can manage own highlight items" ON public.workout_highlight_items;
CREATE POLICY "Users can manage own highlight items"
  ON public.workout_highlight_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.workout_highlights h WHERE h.id = highlight_id AND h.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.workout_highlights h WHERE h.id = highlight_id AND h.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );
