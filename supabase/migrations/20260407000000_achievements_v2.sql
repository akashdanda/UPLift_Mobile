-- Replace all achievements with the full v2 set.
-- Must delete old data BEFORE changing the constraint, since old rows have 'volume'/'goals'.

DELETE FROM public.achievement_feed_posts;
DELETE FROM public.user_achievements;
DELETE FROM public.achievements;

ALTER TABLE public.achievements DROP CONSTRAINT IF EXISTS achievements_category_check;
ALTER TABLE public.achievements ADD CONSTRAINT achievements_category_check
  CHECK (category IN ('consistency', 'social', 'competitive', 'time', 'type', 'milestones'));

INSERT INTO public.achievements (key, name, description, category, icon, requirement_type, requirement_value, sort_order) VALUES
  -- ──── Consistency ────
  ('no_days_off',      'No Days Off',       'Work out every day for a full week',              'consistency', '⚡',  'streak',              7,   10),
  ('grind_season',     'Grind Season',      'Log workouts 30 days in a row',                   'consistency', '🔥',  'streak',              30,  20),
  ('monthly_warrior',  'Monthly Warrior',   'Hit your workout goal every week of the month',   'consistency', '🗓️',  'weekly_goal_streak',  4,   30),
  ('iron_habit',       'Iron Habit',        '100 total workouts logged',                       'consistency', '🏋️',  'workouts_count',      100, 40),

  -- ──── Social / Community ────
  ('hype_man',         'Hype Man',          'React to 50 friends'' workouts',                  'social',      '📣',  'reactions_given',     50,  10),
  ('recruiter',        'Recruiter',         'Invite 5 friends who actually join',              'social',      '🤝',  'friends_count',       5,   20),
  ('pack_leader',      'Pack Leader',       'Start a group that reaches 10 members',           'social',      '🐺',  'group_10_members',    10,  30),
  ('founding_100',     'Founding 100',      'One of the first 100 users on Uplift',            'social',      '💎',  'founding_user',       1,   40),

  -- ──── Competition ────
  ('top_leaderboard',  'Top of the Board',  'Finish #1 in a group challenge',                  'competitive', '👑',  'first_in_group',      1,   10),
  ('comeback_kid',     'Comeback Kid',      'Win a challenge after being in last place',       'competitive', '🔄',  'comeback_win',        1,   20),
  ('undefeated',       'Undefeated',        'Win 3 challenges in a row',                       'competitive', '🏅',  'win_streak',          3,   30),

  -- ──── Time-based ────
  ('early_bird',       'Early Bird',        '30 workouts logged before 8 AM',                  'time',        '🌅',  'early_workouts',      30,  10),
  ('night_owl',        'Night Owl',         '20 workouts logged after 10 PM',                  'time',        '🌙',  'late_workouts',       20,  20),
  ('lunch_break',      'Lunch Break Gains', '15 workouts between 12–1 PM',                     'time',        '🥪',  'lunch_workouts',      15,  30),
  ('weekend_warrior',  'Weekend Warrior',   'Work out every Sat & Sun for a month',            'time',        '🎉',  'weekend_streak',      4,   40),

  -- ──── Workout Type ────
  ('iron_type',        'Iron',              '50 strength workouts logged',                     'type',        '🦾',  'strength_count',      50,  10),
  ('miles_ahead',      'Miles Ahead',       '20 cardio sessions logged',                       'type',        '🏃',  'cardio_count',        20,  20),
  ('zen_mode',         'Zen Mode',          '15 rest / yoga sessions logged',                  'type',        '🧘',  'rest_count',          15,  30),

  -- ──── Milestones ────
  ('day_one',          'Day One',           'Log your very first workout',                     'milestones',  '🌱',  'workouts_count',      1,   10),
  ('getting_started',  'Just Getting Started', 'First 7 days active',                          'milestones',  '🚀',  'streak',              7,   20),
  ('reactions_10',     'Fan Favorite',      'Receive 10 reactions on your posts',              'milestones',  '⭐',  'reactions_received',  10,  30),
  ('comments_10',      'Conversation Starter', 'Receive 10 comments on your posts',           'milestones',  '💬',  'comments_received',   10,  40),
  ('veteran',          'Veteran',           '6 months on Uplift',                              'milestones',  '🎖️',  'account_age_days',    180, 50),
  ('legend',           'Legend',            '1 year on Uplift',                                'milestones',  '👑',  'account_age_days',    365, 60)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  requirement_type = EXCLUDED.requirement_type,
  requirement_value = EXCLUDED.requirement_value,
  sort_order = EXCLUDED.sort_order;
