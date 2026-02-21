-- Run this in Supabase Dashboard → SQL Editor
-- This will delete ALL workouts and user achievements but keep users and friends
-- Also resets Peter Koppany's stats (XP will be 0 since no achievements remain)

-- ============================================================
-- 1) DELETE ALL HIGHLIGHTS (delete before workouts)
-- ============================================================
-- Delete highlight items first (they reference highlights)
DELETE FROM public.workout_highlight_items;
-- Then delete highlights (they reference workouts)
DELETE FROM public.workout_highlights;

-- ============================================================
-- 2) DELETE ALL WORKOUTS (cascades to related tables)
-- ============================================================
-- This will cascade delete:
-- - workout_reactions
-- - workout_comments
-- - workout_tags
DELETE FROM public.workouts;

-- ============================================================
-- 3) DELETE ALL USER ACHIEVEMENTS
-- ============================================================
DELETE FROM public.achievement_feed_posts;
DELETE FROM public.user_achievements;
-- Note: achievements table (the definitions) are kept

-- ============================================================
-- 4) RESET ALL USER STATS (workouts_count, streak, groups_count)
-- ============================================================
UPDATE public.profiles
SET
  workouts_count = 0,
  streak = 0,
  groups_count = 0;

-- ============================================================
-- 5) RESET PETER KOPPANY'S STATS (redundant but explicit)
-- ============================================================
-- Find Peter Koppany by display_name (case-insensitive)
-- Note: This is redundant since step 4 already resets all users,
-- but kept for clarity/explicitness
UPDATE public.profiles
SET
  workouts_count = 0,
  streak = 0,
  groups_count = 0
WHERE LOWER(display_name) = 'peter koppany'
   OR LOWER(display_name) = 'peter koppány'
   OR LOWER(full_name) = 'peter koppany'
   OR LOWER(full_name) = 'peter koppány';

-- ============================================================
-- VERIFICATION QUERIES (run these to verify cleanup)
-- ============================================================
-- SELECT COUNT(*) as workouts_count FROM public.workouts;
-- SELECT COUNT(*) as users_count FROM public.profiles;
-- SELECT COUNT(*) as friendships_count FROM public.friendships;
-- SELECT COUNT(*) as achievements_count FROM public.user_achievements;
-- 
-- -- Check Peter Koppany's stats
-- SELECT id, display_name, workouts_count, streak, groups_count
-- FROM public.profiles
-- WHERE LOWER(display_name) LIKE '%peter%koppany%'
--    OR LOWER(display_name) LIKE '%peter%koppány%';
