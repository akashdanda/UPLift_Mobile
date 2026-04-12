-- Leaderboard: drop group competition wins from monthly points (product has no competitions on the board).

CREATE OR REPLACE FUNCTION public.get_monthly_leaderboard(
  p_limit integer DEFAULT 50,
  p_scope text DEFAULT 'global',
  p_current_user_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_start date;
  v_date_end date;
  v_ts_start timestamptz;
  v_ts_end timestamptz;
  v_rows jsonb;
  v_my_row jsonb;
BEGIN
  v_date_start := (date_trunc('month', timezone('utc', now())))::date;
  v_date_end := (v_date_start + interval '1 month - 1 day')::date;
  v_ts_start := (v_date_start::text || ' 00:00:00+00')::timestamptz;
  v_ts_end := (v_date_end::text || ' 23:59:59.999+00')::timestamptz;

  WITH
  workout_counts AS (
    SELECT w.user_id,
           COUNT(DISTINCT w.workout_date)::integer AS workouts_count
    FROM public.workouts w
    WHERE w.workout_date >= v_date_start
      AND w.workout_date <= v_date_end
      AND (w.workout_type IS NULL OR w.workout_type <> 'rest')
    GROUP BY w.user_id
  ),
  friend_adds AS (
    SELECT f.uid,
           COUNT(*)::integer AS friends_count
    FROM (
      SELECT requester_id AS uid
      FROM public.friendships
      WHERE status = 'accepted'
        AND created_at >= v_ts_start
        AND created_at <= v_ts_end
      UNION ALL
      SELECT addressee_id AS uid
      FROM public.friendships
      WHERE status = 'accepted'
        AND created_at >= v_ts_start
        AND created_at <= v_ts_end
    ) f
    GROUP BY f.uid
  ),
  group_joins AS (
    SELECT gm.user_id,
           COUNT(*)::integer AS groups_count
    FROM public.group_members gm
    WHERE gm.joined_at >= v_ts_start
      AND gm.joined_at <= v_ts_end
    GROUP BY gm.user_id
  ),
  all_user_ids AS (
    SELECT user_id FROM workout_counts
    UNION
    SELECT uid AS user_id FROM friend_adds
    UNION
    SELECT user_id FROM group_joins
  ),
  scored AS (
    SELECT
      u.user_id AS id,
      COALESCE(w.workouts_count, 0) AS workouts_count,
      COALESCE(p.streak, 0) AS streak,
      0::integer AS competition_wins,
      COALESCE(f.friends_count, 0) AS friends_count,
      COALESCE(g.groups_count, 0) AS groups_count,
      (
        COALESCE(f.friends_count, 0) * 5
        + COALESCE(g.groups_count, 0) * 1
        + COALESCE(w.workouts_count, 0) * 20
      )::integer AS points,
      p.display_name,
      p.avatar_url
    FROM all_user_ids u
    LEFT JOIN workout_counts w ON w.user_id = u.user_id
    LEFT JOIN friend_adds f ON f.uid = u.user_id
    LEFT JOIN group_joins g ON g.user_id = u.user_id
    LEFT JOIN public.profiles p ON p.id = u.user_id
  ),
  ranked_global AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (ORDER BY s.points DESC, s.id)::integer AS rank
    FROM scored s
  ),
  allowed AS (
    SELECT a.aid
    FROM (
      SELECT NULL::uuid AS aid WHERE p_scope = 'global'
      UNION ALL
      SELECT p_current_user_id WHERE p_scope IN ('friends', 'groups') AND p_current_user_id IS NOT NULL
      UNION ALL
      SELECT CASE
               WHEN f.requester_id = p_current_user_id THEN f.addressee_id
               ELSE f.requester_id
             END
      FROM public.friendships f
      WHERE p_scope = 'friends'
        AND p_current_user_id IS NOT NULL
        AND f.status = 'accepted'
        AND (f.requester_id = p_current_user_id OR f.addressee_id = p_current_user_id)
      UNION ALL
      SELECT gm.user_id
      FROM public.group_members gm
      WHERE p_scope = 'groups'
        AND p_group_id IS NOT NULL
        AND gm.group_id = p_group_id
      UNION ALL
      SELECT gm2.user_id
      FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm2.group_id = gm1.group_id
      WHERE p_scope = 'groups'
        AND p_group_id IS NULL
        AND p_current_user_id IS NOT NULL
        AND gm1.user_id = p_current_user_id
    ) a
    WHERE a.aid IS NOT NULL
  ),
  scoped AS (
    SELECT r.*
    FROM ranked_global r
    WHERE p_scope = 'global'
    UNION ALL
    SELECT r.*
    FROM ranked_global r
    INNER JOIN allowed al ON al.aid = r.id
    WHERE p_scope <> 'global'
  ),
  reranked AS (
    SELECT
      s.id,
      s.display_name,
      s.avatar_url,
      s.workouts_count,
      s.streak,
      s.competition_wins,
      s.friends_count,
      s.groups_count,
      s.points,
      ROW_NUMBER() OVER (ORDER BY s.points DESC, s.id)::integer AS rank
    FROM scoped s
  ),
  top_slice AS (
    SELECT * FROM reranked ORDER BY rank LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))
  )
  SELECT
    COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id', t.id,
           'display_name', t.display_name,
           'avatar_url', t.avatar_url,
           'workouts_count', t.workouts_count,
           'streak', t.streak,
           'competition_wins', t.competition_wins,
           'friends_count', t.friends_count,
           'groups_count', t.groups_count,
           'points', t.points,
           'rank', t.rank
         ) ORDER BY t.rank
       )
       FROM top_slice t),
      '[]'::jsonb
    ),
    (SELECT jsonb_build_object(
       'id', rr.id,
       'display_name', rr.display_name,
       'avatar_url', rr.avatar_url,
       'workouts_count', rr.workouts_count,
       'streak', rr.streak,
       'competition_wins', rr.competition_wins,
       'friends_count', rr.friends_count,
       'groups_count', rr.groups_count,
       'points', rr.points,
       'rank', rr.rank
     )
     FROM reranked rr
     WHERE p_current_user_id IS NOT NULL AND rr.id = p_current_user_id
     LIMIT 1)
  INTO v_rows, v_my_row;

  RETURN jsonb_build_object('rows', v_rows, 'my_row', v_my_row);
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_leaderboard(integer, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_leaderboard(integer, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_leaderboard(integer, text, uuid, uuid) TO service_role;
