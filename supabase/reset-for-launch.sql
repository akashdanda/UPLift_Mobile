-- Run this in Supabase Dashboard → SQL Editor
-- WARNING: This will delete ALL groups, workouts, competitions, duels, achievements, and reset user stats
-- Users and friendships will be preserved

-- ============================================================
-- 1) DELETE ALL GROUPS (cascades to related tables)
-- ============================================================
-- This will cascade delete:
-- - group_members
-- - group_messages
-- - group_competitions (via foreign keys)
-- - group_invite_tokens
-- - group_invites (if exists)
DELETE FROM public.groups;

-- ============================================================
-- 2) DELETE ALL COMPETITIONS (in case any remain)
-- ============================================================
DELETE FROM public.competition_member_contributions;
DELETE FROM public.group_matchmaking_queue;
DELETE FROM public.group_competitions;

-- ============================================================
-- 3) DELETE ALL HIGHLIGHTS (delete before workouts)
-- ============================================================
-- Delete highlight items first (they reference highlights)
DELETE FROM public.workout_highlight_items;
-- Then delete highlights (they reference workouts)
DELETE FROM public.workout_highlights;

-- ============================================================
-- 4) DELETE ALL WORKOUTS (cascades to related tables)
-- ============================================================
-- This will cascade delete:
-- - workout_reactions
-- - workout_comments
-- - workout_tags
DELETE FROM public.workouts;

-- ============================================================
-- 5) DELETE ALL DUELS (1v1 challenges)
-- ============================================================
DELETE FROM public.duels;

-- ============================================================
-- 6) DELETE ALL ACHIEVEMENTS
-- ============================================================
DELETE FROM public.achievement_feed_posts;
DELETE FROM public.user_achievements;
-- Note: achievements table (the definitions) are kept

-- ============================================================
-- 7) DELETE ALL REPORTS
-- ============================================================
DELETE FROM public.reports;

-- ============================================================
-- 8) RESET USER STATS IN PROFILES
-- ============================================================
UPDATE public.profiles
SET
  workouts_count = 0,
  streak = 0,
  groups_count = 0;

-- ============================================================
-- 9) CLEAN UP STORAGE BUCKETS (optional - uncomment if needed)
-- ============================================================
-- Note: Storage files are not automatically deleted
-- You may want to manually clean up:
-- - workouts bucket (workout images)
-- - reactions bucket (reaction photos)
-- - groups bucket (group avatars)
-- This can be done via Supabase Dashboard → Storage

-- ============================================================
-- VERIFICATION QUERIES (run these to verify cleanup)
-- ============================================================
-- SELECT COUNT(*) as groups_count FROM public.groups;
-- SELECT COUNT(*) as workouts_count FROM public.workouts;
-- SELECT COUNT(*) as competitions_count FROM public.group_competitions;
-- SELECT COUNT(*) as duels_count FROM public.duels;
-- SELECT COUNT(*) as achievements_count FROM public.user_achievements;
-- SELECT COUNT(*) as highlights_count FROM public.workout_highlights;
-- SELECT COUNT(*) as users_count FROM public.profiles;
-- SELECT COUNT(*) as friendships_count FROM public.friendships;
