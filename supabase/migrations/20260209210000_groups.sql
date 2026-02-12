-- Groups: users can create and join multiple groups
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

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Read: public groups or groups you're a member of
CREATE POLICY "Users can read public or joined groups"
  ON public.groups FOR SELECT
  USING (
    is_public = true
    OR id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- Create group (creator only)
CREATE POLICY "Users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Update/delete only creator
CREATE POLICY "Creators can update own group"
  ON public.groups FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can delete own group"
  ON public.groups FOR DELETE
  USING (auth.uid() = created_by);

-- Group members: who is in which group
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read group memberships (needed for member counts, etc.)
CREATE POLICY "Authenticated can read group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (true);

-- Join: add yourself to a public group or to a group you created
CREATE POLICY "Users can join public or own groups"
  ON public.group_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (SELECT is_public FROM public.groups WHERE id = group_id) = true
      OR (SELECT created_by FROM public.groups WHERE id = group_id) = auth.uid()
    )
  );

-- Leave: delete your own membership; or creator can delete (kick)
CREATE POLICY "Users can leave or creator can remove"
  ON public.group_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (SELECT created_by FROM public.groups WHERE id = group_id) = auth.uid()
  );

-- Update profiles.groups_count when joining
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

-- Decrement when leaving
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
