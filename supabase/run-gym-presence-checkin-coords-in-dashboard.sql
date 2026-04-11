-- Run in Supabase Dashboard → SQL Editor if arena pins should use real check-in locations.
-- Safe to run more than once.

ALTER TABLE public.gym_presence
  ADD COLUMN IF NOT EXISTS check_in_lat double precision,
  ADD COLUMN IF NOT EXISTS check_in_lng double precision;
