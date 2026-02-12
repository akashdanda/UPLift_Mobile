-- Storage bucket for workout photos
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
