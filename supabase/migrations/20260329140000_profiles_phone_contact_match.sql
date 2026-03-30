-- Optional phone on profile + discoverability for "find friends from contacts"
-- Phone is never exposed in generic profile reads; matching happens only via RPC.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS discoverable_by_phone BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_e164_unique
  ON public.profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL;

COMMENT ON COLUMN public.profiles.phone_e164 IS 'E.164 format, e.g. +15551234567. Unique when set.';
COMMENT ON COLUMN public.profiles.discoverable_by_phone IS 'When true, users who sync contacts can match this account by phone';

CREATE OR REPLACE FUNCTION public.match_profiles_by_phone_numbers(
  p_phone_numbers text[],
  p_exclude_user_id uuid
)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  workouts_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.workouts_count
  FROM public.profiles p
  WHERE p.discoverable_by_phone = true
    AND p.phone_e164 IS NOT NULL
    AND cardinality(p_phone_numbers) > 0
    AND p.phone_e164 = ANY(p_phone_numbers)
    AND p.id <> p_exclude_user_id
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.match_profiles_by_phone_numbers(text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_profiles_by_phone_numbers(text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_profiles_by_phone_numbers(text[], uuid) TO service_role;
