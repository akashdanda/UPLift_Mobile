-- Add field to track when display_name was last changed (for monthly limit)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name_changed_at TIMESTAMPTZ;

-- Function to check if display_name can be changed (once per month)
CREATE OR REPLACE FUNCTION public.can_change_display_name(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_changed TIMESTAMPTZ;
BEGIN
  SELECT display_name_changed_at INTO last_changed
  FROM public.profiles
  WHERE id = user_id_param;

  -- If never changed, allow it
  IF last_changed IS NULL THEN
    RETURN TRUE;
  END IF;

  -- If changed more than 30 days ago, allow it
  IF last_changed < now() - INTERVAL '30 days' THEN
    RETURN TRUE;
  END IF;

  -- Otherwise, not allowed (changed within last 30 days)
  RETURN FALSE;
END;
$$;

-- Trigger to update display_name_changed_at when display_name changes
CREATE OR REPLACE FUNCTION public.update_display_name_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only update if display_name actually changed
  IF OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    NEW.display_name_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_display_name_changed ON public.profiles;
CREATE TRIGGER on_display_name_changed
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_display_name_changed_at();
