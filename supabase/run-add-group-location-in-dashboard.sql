-- Run this in Supabase Dashboard → SQL Editor
-- Adds the location column to the groups table

ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS location TEXT;
