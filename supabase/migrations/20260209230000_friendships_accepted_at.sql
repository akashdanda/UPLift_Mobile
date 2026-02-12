-- Add accepted_at to friendships for monthly leaderboard (when friendship was accepted)
ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Backfill: accepted rows get accepted_at = created_at (best we have)
UPDATE public.friendships SET accepted_at = created_at WHERE status = 'accepted' AND accepted_at IS NULL;

-- When status changes to accepted, set accepted_at
CREATE OR REPLACE FUNCTION public.set_friendship_accepted_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    NEW.accepted_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_friendship_accepted_at ON public.friendships;
CREATE TRIGGER set_friendship_accepted_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.set_friendship_accepted_at();
