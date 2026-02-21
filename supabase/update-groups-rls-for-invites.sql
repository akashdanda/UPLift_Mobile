-- Run this in Supabase Dashboard → SQL Editor
-- Creates group_invite_tokens table and updates groups RLS policy

-- First, create the group_invite_tokens table if it doesn't exist
CREATE TABLE IF NOT EXISTS group_invite_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intended_recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  used BOOLEAN NOT NULL DEFAULT false,
  used_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS group_invite_tokens_group_id_idx ON group_invite_tokens(group_id);
CREATE INDEX IF NOT EXISTS group_invite_tokens_token_idx ON group_invite_tokens(token);
CREATE INDEX IF NOT EXISTS group_invite_tokens_intended_recipient_idx ON group_invite_tokens(intended_recipient_user_id);
CREATE INDEX IF NOT EXISTS group_invite_tokens_used_idx ON group_invite_tokens(used);

-- RLS policies for group_invite_tokens
ALTER TABLE group_invite_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create invite tokens" ON group_invite_tokens;
CREATE POLICY "Users can create invite tokens"
  ON group_invite_tokens FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by_user_id AND
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = group_invite_tokens.group_id
      AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view invite tokens they created" ON group_invite_tokens;
CREATE POLICY "Users can view invite tokens they created"
  ON group_invite_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by_user_id);

DROP POLICY IF EXISTS "Users can use unused invite tokens" ON group_invite_tokens;
CREATE POLICY "Users can use unused invite tokens"
  ON group_invite_tokens FOR UPDATE
  TO authenticated
  USING (used = false)
  WITH CHECK (used = true AND used_by_user_id = auth.uid());

-- Create a function to check if user has a valid invite token for a group
CREATE OR REPLACE FUNCTION has_valid_invite_token(p_group_id UUID, p_token TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.group_invite_tokens
    WHERE group_id = p_group_id
      AND token = p_token
      AND used = false
      AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can read public or joined groups" ON public.groups;

-- Create updated policy that includes invite tokens
-- Note: This policy allows viewing if there's ANY unused token for the group
-- The application layer will validate the specific token
-- Also allows creators to view their own groups
CREATE POLICY "Users can read public or joined groups"
  ON public.groups FOR SELECT
  USING (
    is_public = true
    OR created_by = auth.uid()
    OR id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.group_invite_tokens
      WHERE group_id = groups.id
      AND used = false
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );
