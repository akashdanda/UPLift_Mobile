-- Store device coordinates at check-in so gym arena can show people where they actually were,
-- instead of faking everyone around the gym centroid (which breaks QA / same-address gyms).

ALTER TABLE public.gym_presence
  ADD COLUMN IF NOT EXISTS check_in_lat double precision,
  ADD COLUMN IF NOT EXISTS check_in_lng double precision;

COMMENT ON COLUMN public.gym_presence.check_in_lat IS 'Latitude when user last checked in at this gym (arena map).';
COMMENT ON COLUMN public.gym_presence.check_in_lng IS 'Longitude when user last checked in at this gym (arena map).';
