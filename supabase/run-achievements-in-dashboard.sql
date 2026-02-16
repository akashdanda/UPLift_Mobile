-- ============================================================================
-- ACHIEVEMENT & GAMIFICATION SYSTEM
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) achievements — master list of all unlockable achievements
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('consistency', 'volume', 'competitive', 'social', 'goals')),
  icon        TEXT NOT NULL DEFAULT '🏅',
  requirement_type  TEXT NOT NULL,
  requirement_value INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
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
  notified       BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked ON public.user_achievements(user_id, unlocked);

-- --------------------------------------------------------------------------
-- 3) achievement_feed_posts — system-generated announcements
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
  month_year TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_year)
);

-- --------------------------------------------------------------------------
-- 5) leaderboard_snapshots — for rank movement tracking
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL DEFAULT 'global',
  rank       INTEGER NOT NULL,
  points     INTEGER NOT NULL,
  period     TEXT NOT NULL,
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
DO $$ BEGIN
  CREATE POLICY "Anyone can read achievements"
    ON public.achievements FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_achievements
DO $$ BEGIN
  CREATE POLICY "Users can read own achievements"
    ON public.user_achievements FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can read others achievements"
    ON public.user_achievements FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own achievements"
    ON public.user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own achievements"
    ON public.user_achievements FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- achievement_feed_posts
DO $$ BEGIN
  CREATE POLICY "Anyone can read achievement feed"
    ON public.achievement_feed_posts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own achievement posts"
    ON public.achievement_feed_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- streak_freezes
DO $$ BEGIN
  CREATE POLICY "Users can read own freezes"
    ON public.streak_freezes FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own freezes"
    ON public.streak_freezes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- leaderboard_snapshots
DO $$ BEGIN
  CREATE POLICY "Anyone can read snapshots"
    ON public.leaderboard_snapshots FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own snapshots"
    ON public.leaderboard_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own snapshots"
    ON public.leaderboard_snapshots FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 7) Seed achievement definitions
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
-- 8) Streak freeze functions
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

-- Done! ✅
SELECT 'Achievement system created successfully!' AS result;
