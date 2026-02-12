-- Add avatar_url, tags, and bio to groups table
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Create group_messages table for chat
CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON public.group_messages(created_at DESC);

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Only members can read messages
CREATE POLICY "Members can read group messages"
  ON public.group_messages FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- Only members can send messages
CREATE POLICY "Members can send group messages"
  ON public.group_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- Add ranking/points to group_members for leaderboard
ALTER TABLE public.group_members
ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_group_members_points ON public.group_members(group_id, points DESC);
