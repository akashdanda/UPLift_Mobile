-- Fix Security Advisor: enable RLS on mock_calendar_backup.
-- Run in Supabase Dashboard → SQL Editor (once). Safe to run even if the table is empty or doesn't exist yet.
-- With RLS enabled and no policies, the API cannot access this table; your insert/revert scripts (run in SQL Editor) still work.

ALTER TABLE IF EXISTS public.mock_calendar_backup ENABLE ROW LEVEL SECURITY;
