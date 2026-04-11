-- Keep gyms.location in sync with lat/lng so get_nearby_gyms (PostGIS) returns rows.
-- Also allow UPDATE so client upserts can refresh names/coords (RLS previously blocked updates).

CREATE OR REPLACE FUNCTION public.set_gym_location_from_coords()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gyms_location ON public.gyms;
CREATE TRIGGER trg_gyms_location
  BEFORE INSERT OR UPDATE OF lat, lng ON public.gyms
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_gym_location_from_coords();

UPDATE public.gyms
SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
WHERE location IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;

DROP POLICY IF EXISTS "Anyone authenticated can update gyms" ON public.gyms;
CREATE POLICY "Anyone authenticated can update gyms"
  ON public.gyms
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
