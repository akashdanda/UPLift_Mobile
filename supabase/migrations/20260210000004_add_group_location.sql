-- Add location field to groups table
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS location TEXT;
