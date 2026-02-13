-- BeReal-style reactions: one reaction per user per workout (photo + emoji)
CREATE TABLE IF NOT EXISTS public.workout_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  reaction_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workout_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workout_reactions_workout_id ON public.workout_reactions(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_reactions_user_id ON public.workout_reactions(user_id);

ALTER TABLE public.workout_reactions ENABLE ROW LEVEL SECURITY;

-- Read: anyone can see reactions on workouts (feed)
CREATE POLICY "Anyone can read workout reactions"
  ON public.workout_reactions FOR SELECT
  USING (true);

-- Insert: only add reaction to a friend's workout (not your own)
CREATE POLICY "Friends can add reaction to friend workout"
  ON public.workout_reactions FOR INSERT
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

-- Update/delete: only your own reaction
CREATE POLICY "Users can update own reaction"
  ON public.workout_reactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reaction"
  ON public.workout_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Storage bucket for reaction selfies
INSERT INTO storage.buckets (id, name, public)
VALUES ('reactions', 'reactions', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Path: workout_id/user_id.jpg — only reactor can upload/update/delete their file
CREATE POLICY "User can upload own reaction image"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reactions'
    AND split_part(name, '/', 2) = auth.uid()::text || '.jpg'
  );

CREATE POLICY "User can update own reaction image"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'reactions'
    AND split_part(name, '/', 2) = auth.uid()::text || '.jpg'
  );

CREATE POLICY "User can delete own reaction image"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reactions'
    AND split_part(name, '/', 2) = auth.uid()::text || '.jpg'
  );

CREATE POLICY "Reaction images are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'reactions');
