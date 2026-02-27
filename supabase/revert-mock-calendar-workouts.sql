-- Revert mock calendar data (run after taking App Store screenshot).
-- Run in Supabase Dashboard → SQL Editor.
-- Use the SAME UUID you used in insert-mock-calendar-workouts.sql (from Authentication → Users, not display name).
-- Restores the profile's created_at from backup so signup date is correct again.

DO $$
DECLARE
  v_user_id UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';  -- ← Replace with same UUID you used in insert script
  v_deleted INTEGER;
BEGIN
  IF v_user_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::UUID THEN
    RAISE EXCEPTION 'Replace v_user_id with the user UUID from Authentication → Users (not the display name).';
  END IF;

  -- Restore profile created_at (was set to 2026-01-15 so all Feb days showed as red when skipped)
  UPDATE public.profiles p
  SET created_at = b.created_at
  FROM public.mock_calendar_backup b
  WHERE p.id = b.user_id AND b.user_id = v_user_id;

  DELETE FROM public.mock_calendar_backup WHERE user_id = v_user_id;

  DELETE FROM public.workouts
  WHERE user_id = v_user_id
    AND workout_date IN (
      '2026-02-01', '2026-02-08', '2026-02-09', '2026-02-11', '2026-02-12', '2026-02-13',
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-21', '2026-02-22'
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Restore profile workouts_count (triggers only run on INSERT, not DELETE)
  UPDATE public.profiles
  SET workouts_count = (
    SELECT COUNT(*)::INTEGER FROM public.workouts WHERE user_id = profiles.id
  )
  WHERE id = v_user_id;

  -- Streak may need to be recalculated by the app or you can set to 0 if this was only mock data
  -- UPDATE public.profiles SET streak = 0 WHERE id = v_user_id;

  RAISE NOTICE 'Deleted % mock workout(s) for user %.', v_deleted, v_user_id;
END $$;
