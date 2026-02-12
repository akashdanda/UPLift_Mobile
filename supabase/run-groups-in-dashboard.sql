-- Run this in Supabase Dashboard → SQL Editor
-- Creates groups, group_members, RLS, and triggers for profiles.groups_count

-- 1) Groups table (no policy that references group_members yet)
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_is_public ON public.groups(is_public);

-- 2) Group members table (must exist before we add groups policy that references it)
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);

-- 3) Groups RLS and policies (group_members now exists)
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read public or joined groups" ON public.groups;
CREATE POLICY "Users can read public or joined groups"
  ON public.groups FOR SELECT
  USING (
    is_public = true
    OR id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
CREATE POLICY "Users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Creators can update own group" ON public.groups;
CREATE POLICY "Creators can update own group"
  ON public.groups FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Creators can delete own group" ON public.groups;
CREATE POLICY "Creators can delete own group"
  ON public.groups FOR DELETE
  USING (auth.uid() = created_by);

-- 4) Group members RLS and policies
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Bypass RLS inside the function to avoid infinite recursion when policy calls this
CREATE OR REPLACE FUNCTION public.my_group_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  SET LOCAL row_security = off;
  RETURN QUERY SELECT group_id FROM public.group_members WHERE user_id = auth.uid();
END;
$$;

DROP POLICY IF EXISTS "Members can read group members" ON public.group_members;
CREATE POLICY "Members can read group members"
  ON public.group_members FOR SELECT
  USING (group_id IN (SELECT public.my_group_ids()));

DROP POLICY IF EXISTS "Users can join public or own groups" ON public.group_members;
CREATE POLICY "Users can join public or own groups"
  ON public.group_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (SELECT is_public FROM public.groups WHERE id = group_id) = true
      OR (SELECT created_by FROM public.groups WHERE id = group_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can leave or creator can remove" ON public.group_members;
CREATE POLICY "Users can leave or creator can remove"
  ON public.group_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (SELECT created_by FROM public.groups WHERE id = group_id) = auth.uid()
  );

-- 5) Update profiles.groups_count on join/leave
CREATE OR REPLACE FUNCTION public.increment_groups_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET groups_count = groups_count + 1 WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_group_member_joined ON public.group_members;
CREATE TRIGGER on_group_member_joined
  AFTER INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.increment_groups_count();

CREATE OR REPLACE FUNCTION public.decrement_groups_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET groups_count = GREATEST(0, groups_count - 1) WHERE id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_group_member_left ON public.group_members;
CREATE TRIGGER on_group_member_left
  AFTER DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.decrement_groups_count();
