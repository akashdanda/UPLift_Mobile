-- Remove bio column from groups table (keeping only description)
ALTER TABLE public.groups
DROP COLUMN IF EXISTS bio;
