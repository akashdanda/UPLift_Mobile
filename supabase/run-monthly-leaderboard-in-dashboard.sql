-- Run in Supabase Dashboard → SQL Editor
-- Adds accepted_at to friendships so monthly leaderboard can count "friends added this month"

ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

UPDATE public.friendships SET accepted_at = created_at WHERE status = 'accepted' AND accepted_at IS NULL;

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
