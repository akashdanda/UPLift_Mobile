-- Allow custom cover image URL for highlights (from camera roll); when set, overrides cover_workout_id for display.
ALTER TABLE public.workout_highlights
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Storage bucket for highlight cover images (camera roll uploads)
INSERT INTO storage.buckets (id, name, public)
VALUES ('highlight-covers', 'highlight-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Authenticated users can upload to their own folder: user_id/highlight_id/cover.jpg
CREATE POLICY "Users can upload own highlight cover"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'highlight-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own highlight cover"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'highlight-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own highlight cover"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'highlight-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Highlight cover images are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'highlight-covers');
