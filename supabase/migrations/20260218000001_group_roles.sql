-- Add role column to group_members: 'owner', 'admin', 'member'
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner', 'admin', 'member'));

-- Set all existing group creators as owners
UPDATE public.group_members gm
SET role = 'owner'
FROM public.groups g
WHERE gm.group_id = g.id
  AND gm.user_id = g.created_by;

-- Index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_group_members_role ON public.group_members(group_id, role);

-- Drop old delete policy (creator-only kick)
DROP POLICY IF EXISTS "Users can leave or creator can remove" ON public.group_members;

-- New delete policy: members can leave, owner/admin can kick (but not the owner)
CREATE POLICY "Users can leave or staff can remove"
  ON public.group_members FOR DELETE
  USING (
    -- You can always leave yourself
    user_id = auth.uid()
    OR (
      -- Owner or admin of the group can kick
      EXISTS (
        SELECT 1 FROM public.group_members gm2
        WHERE gm2.group_id = group_members.group_id
          AND gm2.user_id = auth.uid()
          AND gm2.role IN ('owner', 'admin')
      )
      -- But nobody can kick the owner
      AND group_members.role != 'owner'
    )
  );

-- Drop old update policy on groups (creator-only)
DROP POLICY IF EXISTS "Creators can update own group" ON public.groups;

-- New update policy: owner or admin can update group
CREATE POLICY "Owner or admin can update group"
  ON public.groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('owner', 'admin')
    )
  );

-- Delete policy stays owner-only (via created_by)
-- The existing "Creators can delete own group" policy already handles this.

-- Allow owner/admin to update member roles (for promote/demote)
CREATE POLICY "Owner or admin can update member role"
  ON public.group_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = group_members.group_id
        AND gm2.user_id = auth.uid()
        AND gm2.role IN ('owner', 'admin')
    )
  );

-- Function to get a user's role in a group
CREATE OR REPLACE FUNCTION public.get_member_role(p_group_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id
  LIMIT 1;
$$;
