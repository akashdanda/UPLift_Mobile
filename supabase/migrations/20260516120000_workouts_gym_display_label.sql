-- Denormalized gym name/address on workout posts so feed viewers always see location
-- without depending on a live join to `gyms` or the poster's in-memory cache.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS gym_display_label TEXT;

COMMENT ON COLUMN public.workouts.gym_display_label IS
  'Gym name (and optional address) captured at post time for feed display.';

UPDATE public.workouts w
SET gym_display_label = CASE
  WHEN TRIM(COALESCE(g.address, '')) <> '' THEN TRIM(g.name) || ' · ' || TRIM(g.address)
  ELSE TRIM(g.name)
END
FROM public.gyms g
WHERE w.gym_id = g.id
  AND (w.gym_display_label IS NULL OR TRIM(w.gym_display_label) = '')
  AND TRIM(COALESCE(g.name, '')) <> '';
