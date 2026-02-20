-- Run this in Supabase Dashboard → SQL Editor
-- Creates the group_invites table for in-app group invitations

-- 1) Group invites table
CREATE TABLE IF NOT EXISTS public.group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, invited_user_id)
);

-- Constraint on status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_invites_status_check'
  ) THEN
    ALTER TABLE public.group_invites
      ADD CONSTRAINT group_invites_status_check
      CHECK (status IN ('pending', 'accepted', 'declined'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON public.group_invites(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_invited_user ON public.group_invites(invited_user_id, status);
CREATE INDEX IF NOT EXISTS idx_group_invites_invited_by ON public.group_invites(invited_by);

-- 2) RLS
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- SELECT: inviter, invitee, or group members can see invites
DROP POLICY IF EXISTS "Users can read relevant invites" ON public.group_invites;
CREATE POLICY "Users can read relevant invites"
  ON public.group_invites FOR SELECT
  USING (
    invited_user_id = auth.uid()
    OR invited_by = auth.uid()
    OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- INSERT: group members can invite others
DROP POLICY IF EXISTS "Members can create invites" ON public.group_invites;
CREATE POLICY "Members can create invites"
  ON public.group_invites FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- UPDATE: only the invited user can accept/decline
DROP POLICY IF EXISTS "Invitee can respond to invite" ON public.group_invites;
CREATE POLICY "Invitee can respond to invite"
  ON public.group_invites FOR UPDATE
  USING (invited_user_id = auth.uid())
  WITH CHECK (invited_user_id = auth.uid());

-- DELETE: inviter, invitee, or group owner/admin can cancel invites
DROP POLICY IF EXISTS "Inviter or staff can cancel invite" ON public.group_invites;
CREATE POLICY "Inviter or staff can cancel invite"
  ON public.group_invites FOR DELETE
  USING (
    invited_by = auth.uid()
    OR invited_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_invites.group_id
        AND gm.user_id = auth.uid()
        AND gm."role" IN ('owner', 'admin')
    )
  );
