-- Run this in Supabase Dashboard → SQL Editor
-- Fixes RLS policies on the groups table to ensure create/update/delete all work

-- ============================================================
-- 1) GROUPS TABLE POLICIES
-- ============================================================

-- SELECT: anyone can see public groups, groups they created, or groups they're in
DROP POLICY IF EXISTS "Users can read public or joined groups" ON public.groups;
CREATE POLICY "Users can read public or joined groups"
  ON public.groups FOR SELECT
  USING (
    is_public = true
    OR created_by = auth.uid()
    OR id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- INSERT: any authenticated user can create a group (must set created_by to themselves)
DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
CREATE POLICY "Users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- UPDATE: owner or admin can update (falls back to creator check if role column missing)
DROP POLICY IF EXISTS "Creators can update own group" ON public.groups;
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

-- DELETE: only the creator can delete
DROP POLICY IF EXISTS "Creators can delete own group" ON public.groups;
CREATE POLICY "Creators can delete own group"
  ON public.groups FOR DELETE
  USING (auth.uid() = created_by);

-- ============================================================
-- 2) GROUP MEMBERS TABLE POLICIES
-- ============================================================

-- SELECT: any authenticated user can read memberships
DROP POLICY IF EXISTS "Members can read group members" ON public.group_members;
DROP POLICY IF EXISTS "Authenticated can read group members" ON public.group_members;
CREATE POLICY "Authenticated can read group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: users can join public groups, groups they created, or groups they were invited to
DROP POLICY IF EXISTS "Users can join public or own groups" ON public.group_members;
CREATE POLICY "Users can join public or own groups"
  ON public.group_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (SELECT is_public FROM public.groups WHERE id = group_id) = true
      OR (SELECT created_by FROM public.groups WHERE id = group_id) = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.group_invites gi
        WHERE gi.group_id = group_id
          AND gi.invited_user_id = auth.uid()
          AND gi.status = 'pending'
      )
    )
  );

-- UPDATE: owner or admin can update member roles
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

-- DELETE: members can leave, or owner/admin can kick (but not the owner)
DROP POLICY IF EXISTS "Users can leave or creator can remove" ON public.group_members;
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

-- ============================================================
-- 3) Ensure existing group creators are marked as 'owner'
-- ============================================================
UPDATE public.group_members gm
SET "role" = 'owner'
FROM public.groups g
WHERE gm.group_id = g.id
  AND gm.user_id = g.created_by
  AND gm."role" = 'member';
