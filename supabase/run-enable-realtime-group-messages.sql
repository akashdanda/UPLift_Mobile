-- Run this in Supabase Dashboard → SQL Editor
-- Enables realtime broadcasts for group_messages so chat updates live

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
