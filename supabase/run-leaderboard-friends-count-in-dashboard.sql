-- Run in Supabase Dashboard → SQL Editor (after profiles + friendships exist)
-- Adds friends_count to profiles for the unified leaderboard points

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS friends_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.profiles p
SET friends_count = (
  SELECT COUNT(*)::integer
  FROM public.friendships f
  WHERE f.status = 'accepted'
    AND (f.requester_id = p.id OR f.addressee_id = p.id)
);

CREATE OR REPLACE FUNCTION public.increment_friends_count_on_accept()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE public.profiles SET friends_count = friends_count + 1 WHERE id = NEW.requester_id;
    UPDATE public.profiles SET friends_count = friends_count + 1 WHERE id = NEW.addressee_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_friendship_accepted ON public.friendships;
CREATE TRIGGER on_friendship_accepted
  AFTER UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.increment_friends_count_on_accept();

CREATE OR REPLACE FUNCTION public.decrement_friends_count_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'accepted' THEN
    UPDATE public.profiles SET friends_count = GREATEST(0, friends_count - 1) WHERE id = OLD.requester_id;
    UPDATE public.profiles SET friends_count = GREATEST(0, friends_count - 1) WHERE id = OLD.addressee_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_friendship_deleted ON public.friendships;
CREATE TRIGGER on_friendship_deleted
  AFTER DELETE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.decrement_friends_count_on_delete();
