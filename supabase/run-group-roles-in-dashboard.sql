-- ============================================================
-- GROUP ROLES: Owner / Admin / Member
-- Run this in the Supabase Dashboard SQL Editor
-- ============================================================

-- 1) Add role column to group_members (role is a reserved word, must quote it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'group_members'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.group_members
      ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';
  END IF;
END $$;

-- Add check constraint (safe if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_members_role_check'
  ) THEN
    ALTER TABLE public.group_members
      ADD CONSTRAINT group_members_role_check
      CHECK ("role" IN ('owner', 'admin', 'member'));
  END IF;
END $$;

-- 2) Set existing group creators as owners
UPDATE public.group_members gm
SET "role" = 'owner'
FROM public.groups g
WHERE gm.group_id = g.id
  AND gm.user_id = g.created_by
  AND gm."role" = 'member';

-- 3) Index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_group_members_role ON public.group_members(group_id, "role");

-- 4) Drop old delete policy on group_members
DROP POLICY IF EXISTS "Users can leave or creator can remove" ON public.group_members;

-- 5) New delete policy: members can leave, owner/admin can kick (but not the owner)
DROP POLICY IF EXISTS "Users can leave or staff can remove" ON public.group_members;
CREATE POLICY "Users can leave or staff can remove"
  ON public.group_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM public.group_members gm2
        WHERE gm2.group_id = group_members.group_id
          AND gm2.user_id = auth.uid()
          AND gm2."role" IN ('owner', 'admin')
      )
      AND group_members."role" != 'owner'
    )
  );

-- 6) Drop old update policy on groups
DROP POLICY IF EXISTS "Creators can update own group" ON public.groups;

-- 7) New update policy: owner or admin can update group
DROP POLICY IF EXISTS "Owner or admin can update group" ON public.groups;
CREATE POLICY "Owner or admin can update group"
  ON public.groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
        AND gm."role" IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
        AND gm."role" IN ('owner', 'admin')
    )
  );

-- 8) Allow owner/admin to update member roles (for promote/demote)
DROP POLICY IF EXISTS "Owner or admin can update member role" ON public.group_members;
CREATE POLICY "Owner or admin can update member role"
  ON public.group_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2."role" IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2."role" IN ('owner', 'admin')
    )
  );

-- 9) Helper function to get a user's role in a group
CREATE OR REPLACE FUNCTION public.get_member_role(p_group_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "role" FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id
  LIMIT 1;
$$;
