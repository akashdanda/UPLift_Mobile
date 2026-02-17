-- Run this in Supabase Dashboard → SQL Editor if you get "Could not find the 'bio' column of 'profiles'"
-- Adds the bio column to profiles (used in Edit profile screen).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT;
