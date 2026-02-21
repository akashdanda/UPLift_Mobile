-- Group invite tokens table for one-time use invites
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

-- RLS policies
ALTER TABLE group_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Users can create invite tokens for groups they're members of
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

-- Users can view invite tokens they created
CREATE POLICY "Users can view invite tokens they created"
  ON group_invite_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by_user_id);

-- Users can update invite tokens to mark them as used (anyone can use an unused token once)
CREATE POLICY "Users can use unused invite tokens"
  ON group_invite_tokens FOR UPDATE
  TO authenticated
  USING (used = false)
  WITH CHECK (used = true AND used_by_user_id = auth.uid());
