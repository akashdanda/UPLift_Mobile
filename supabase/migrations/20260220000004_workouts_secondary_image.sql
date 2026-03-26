-- BeReal-style dual camera: optional second image (e.g. front + back)
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS secondary_image_url TEXT;

COMMENT ON COLUMN public.workouts.secondary_image_url IS 'Optional second photo (e.g. selfie); with image_url forms a dual-camera BeReal-style post.';
