-- Fix: allow commenting on own workouts + public posts from non-friends.
-- Old policy blocked self-comments and required friendship.

DROP POLICY IF EXISTS "Friends can comment on friend workout" ON public.workout_comments;

CREATE POLICY "Authenticated users can comment"
  ON public.workout_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- Own workout
      (SELECT w.user_id FROM public.workouts w WHERE w.id = workout_id) = auth.uid()
      -- Friend's workout
      OR EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted'
          AND (
            (requester_id = auth.uid() AND addressee_id = (SELECT w.user_id FROM public.workouts w WHERE w.id = workout_id))
            OR (addressee_id = auth.uid() AND requester_id = (SELECT w.user_id FROM public.workouts w WHERE w.id = workout_id))
          )
      )
      -- Public workout
      OR (SELECT w.visibility FROM public.workouts w WHERE w.id = workout_id) = 'public'
    )
  );
