-- Run this in Supabase Dashboard → SQL Editor (after profiles + avatars are set up)
-- Creates workouts table (one post per user per day) and workout images storage bucket

-- 1) Workouts table
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_date DATE NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workout_date)
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON public.workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_workout_date ON public.workouts(workout_date);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own workouts"
  ON public.workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout"
  ON public.workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read workouts"
  ON public.workouts FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.increment_workouts_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET workouts_count = workouts_count + 1
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workout_created ON public.workouts;
CREATE TRIGGER on_workout_created
  AFTER INSERT ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.increment_workouts_count();

-- 2) Workout images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('workouts', 'workouts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Users can upload own workout image"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workouts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own workout image"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workouts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own workout image"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workouts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Workout images are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'workouts');
