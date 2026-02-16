-- ============================================================================
-- Achievement & Gamification System
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) achievements — master list of all unlockable achievements
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,              -- e.g. 'streak_3', 'workouts_50'
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('consistency', 'volume', 'competitive', 'social', 'goals')),
  icon        TEXT NOT NULL DEFAULT '🏅',        -- emoji or icon name
  requirement_type  TEXT NOT NULL,               -- e.g. 'streak', 'workouts_count', 'reactions_received', ...
  requirement_value INTEGER NOT NULL DEFAULT 1,  -- the threshold to unlock
  sort_order  INTEGER NOT NULL DEFAULT 0,        -- for display ordering
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2) user_achievements — per-user progress + unlock state
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  progress_value INTEGER NOT NULL DEFAULT 0,
  unlocked       BOOLEAN NOT NULL DEFAULT false,
  unlocked_at    TIMESTAMPTZ,
  notified       BOOLEAN NOT NULL DEFAULT false,  -- has the celebration been shown?
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked ON public.user_achievements(user_id, unlocked);

-- --------------------------------------------------------------------------
-- 3) achievement_feed_posts — system-generated announcement posts
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievement_feed_posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  message        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_achievement_feed_user ON public.achievement_feed_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_achievement_feed_created ON public.achievement_feed_posts(created_at DESC);

-- --------------------------------------------------------------------------
-- 4) streak_freezes — one free freeze per month
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.streak_freezes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  month_year TEXT NOT NULL,  -- e.g. '2026-02' to enforce 1/month
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_year)
);

-- --------------------------------------------------------------------------
-- 5) leaderboard_snapshots — weekly rank snapshots for movement tracking
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL DEFAULT 'global',  -- 'global', 'friends', group_id
  rank       INTEGER NOT NULL,
  points     INTEGER NOT NULL,
  period     TEXT NOT NULL,   -- e.g. '2026-W07', '2026-02'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope, period)
);

CREATE INDEX IF NOT EXISTS idx_lb_snapshots_user ON public.leaderboard_snapshots(user_id);

-- --------------------------------------------------------------------------
-- 6) RLS policies
-- --------------------------------------------------------------------------
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- achievements: everyone can read
CREATE POLICY "Anyone can read achievements"
  ON public.achievements FOR SELECT USING (true);

-- user_achievements: users can read/write their own
CREATE POLICY "Users can read own achievements"
  ON public.user_achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read others achievements"
  ON public.user_achievements FOR SELECT USING (true);
CREATE POLICY "Users can insert own achievements"
  ON public.user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own achievements"
  ON public.user_achievements FOR UPDATE USING (auth.uid() = user_id);

-- achievement_feed_posts: everyone can read, user can insert own
CREATE POLICY "Anyone can read achievement feed"
  ON public.achievement_feed_posts FOR SELECT USING (true);
CREATE POLICY "Users can insert own achievement posts"
  ON public.achievement_feed_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- streak_freezes: users manage their own
CREATE POLICY "Users can read own freezes"
  ON public.streak_freezes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own freezes"
  ON public.streak_freezes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- leaderboard_snapshots: users can read all, system inserts
CREATE POLICY "Anyone can read snapshots"
  ON public.leaderboard_snapshots FOR SELECT USING (true);
CREATE POLICY "Users can insert own snapshots"
  ON public.leaderboard_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own snapshots"
  ON public.leaderboard_snapshots FOR UPDATE USING (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- 7) Seed the achievement definitions
-- --------------------------------------------------------------------------
INSERT INTO public.achievements (key, name, description, category, icon, requirement_type, requirement_value, sort_order) VALUES
  -- 🔥 Consistency
  ('streak_3',   '3 Day Streak',      'Log workouts 3 days in a row',       'consistency', '🔥', 'streak',          3,   10),
  ('streak_7',   '7 Day Streak',      'Log workouts 7 days in a row',       'consistency', '🔥', 'streak',          7,   20),
  ('streak_14',  '14 Day Streak',     'Log workouts 14 days in a row',      'consistency', '🔥', 'streak',          14,  30),
  ('streak_30',  '30 Day Streak',     'Log workouts 30 days in a row',      'consistency', '🔥', 'streak',          30,  40),
  ('streak_100', '100 Day Streak',    'Log workouts 100 days in a row',     'consistency', '🔥', 'streak',          100, 50),
  -- 💪 Volume
  ('workouts_10',  '10 Workouts',     'Log 10 total workouts',              'volume', '💪', 'workouts_count',  10,  10),
  ('workouts_50',  '50 Workouts',     'Log 50 total workouts',              'volume', '💪', 'workouts_count',  50,  20),
  ('workouts_100', '100 Workouts',    'Log 100 total workouts',             'volume', '💪', 'workouts_count',  100, 30),
  ('workouts_200', '200 Workouts',    'Log 200 total workouts',             'volume', '💪', 'workouts_count',  200, 40),
  -- 🏆 Competitive
  ('top3_weekly',     'Top 3 Finisher',      'Finish in the top 3 on the weekly leaderboard', 'competitive', '🏆', 'top3_weekly',        1,  10),
  ('first_in_group',  '#1 in Group',         'Finish #1 in your group leaderboard',           'competitive', '🏆', 'first_in_group',     1,  20),
  ('climb_5',         'Climb 5 Spots',       'Climb 5 leaderboard spots in one week',         'competitive', '🏆', 'rank_climb',         5,  30),
  -- 👥 Social
  ('first_post',          'First Post',            'Log your very first workout',                 'social', '👥', 'workouts_count',     1,   10),
  ('reactions_10',        '10 Reactions',           'Receive 10 reactions on your posts',          'social', '👥', 'reactions_received',  10,  20),
  ('comments_10',         '10 Comments',            'Receive 10 comments on your posts',           'social', '👥', 'comments_received',   10,  30),
  ('friends_3',           'Invite 3 Friends',       'Add 3 friends on UPLift',                     'social', '👥', 'friends_count',       3,   40),
  -- 🎯 Goals
  ('weekly_goal_4',  'Weekly Warrior',       'Hit your weekly goal 4 weeks in a row', 'goals', '🎯', 'weekly_goal_streak', 4,  10),
  ('perfect_month',  'Perfect Month',        'Log a workout every day for a full month', 'goals', '🎯', 'perfect_month',      1,  20)
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------------------------
-- 8) Function: check and update achievement progress for a user
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_achievements(p_user_id UUID)
RETURNS TABLE(achievement_key TEXT, achievement_name TEXT, achievement_icon TEXT, just_unlocked BOOLEAN) AS $$
DECLARE
  v_streak INTEGER;
  v_workouts INTEGER;
  v_friends INTEGER;
  v_reactions INTEGER;
  v_comments INTEGER;
  v_achievement RECORD;
  v_current_progress INTEGER;
  v_was_unlocked BOOLEAN;
BEGIN
  -- Gather user stats
  SELECT COALESCE(streak, 0), COALESCE(workouts_count, 0)
  INTO v_streak, v_workouts
  FROM public.profiles WHERE id = p_user_id;

  SELECT COALESCE(friends_count, 0)
  INTO v_friends
  FROM public.profiles WHERE id = p_user_id;

  -- Count reactions received on user's workouts
  SELECT COUNT(*)::INTEGER INTO v_reactions
  FROM public.workout_reactions wr
  JOIN public.workouts w ON w.id = wr.workout_id
  WHERE w.user_id = p_user_id;

  -- Count comments received on user's workouts
  SELECT COUNT(*)::INTEGER INTO v_comments
  FROM public.workout_comments wc
  JOIN public.workouts w ON w.id = wc.workout_id
  WHERE w.user_id = p_user_id AND wc.user_id != p_user_id;

  -- Loop through all achievements
  FOR v_achievement IN SELECT * FROM public.achievements ORDER BY sort_order LOOP
    -- Determine current progress based on requirement_type
    v_current_progress := CASE v_achievement.requirement_type
      WHEN 'streak' THEN v_streak
      WHEN 'workouts_count' THEN v_workouts
      WHEN 'friends_count' THEN v_friends
      WHEN 'reactions_received' THEN v_reactions
      WHEN 'comments_received' THEN v_comments
      ELSE 0
    END;

    -- Upsert user_achievement row
    INSERT INTO public.user_achievements (user_id, achievement_id, progress_value, unlocked, unlocked_at, updated_at)
    VALUES (
      p_user_id,
      v_achievement.id,
      v_current_progress,
      v_current_progress >= v_achievement.requirement_value,
      CASE WHEN v_current_progress >= v_achievement.requirement_value THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (user_id, achievement_id) DO UPDATE SET
      progress_value = EXCLUDED.progress_value,
      unlocked = CASE 
        WHEN user_achievements.unlocked THEN true  -- once unlocked, stays unlocked
        ELSE EXCLUDED.unlocked
      END,
      unlocked_at = CASE
        WHEN user_achievements.unlocked THEN user_achievements.unlocked_at  -- keep original unlock time
        WHEN EXCLUDED.unlocked THEN now()
        ELSE NULL
      END,
      updated_at = now()
    RETURNING unlocked INTO v_was_unlocked;

    -- Check if this was JUST unlocked (not previously)
    SELECT unlocked INTO v_was_unlocked
    FROM public.user_achievements
    WHERE user_id = p_user_id AND achievement_id = v_achievement.id;

    achievement_key := v_achievement.key;
    achievement_name := v_achievement.name;
    achievement_icon := v_achievement.icon;
    just_unlocked := v_was_unlocked AND NOT (
      SELECT COALESCE(notified, false)
      FROM public.user_achievements
      WHERE user_id = p_user_id AND achievement_id = v_achievement.id
    );

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------------
-- 9) Function: use a streak freeze
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_streak_freeze(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_month TEXT;
BEGIN
  v_month := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
  
  INSERT INTO public.streak_freezes (user_id, month_year)
  VALUES (p_user_id, v_month)
  ON CONFLICT (user_id, month_year) DO NOTHING;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------------
-- 10) Function: check if streak freeze is available this month
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_streak_freeze_available(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.streak_freezes
    WHERE user_id = p_user_id
      AND month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
