-- Group Competitions (Clan Wars style)
-- Groups can compete against each other in timed competitions

-- Competition types: 'matchmaking' (auto-matched) or 'challenge' (direct challenge)
CREATE TYPE competition_type AS ENUM ('matchmaking', 'challenge');

-- Competition status: 'pending' (waiting for match/acceptance), 'active' (in progress), 'completed' (finished), 'cancelled'
CREATE TYPE competition_status AS ENUM ('pending', 'active', 'completed', 'cancelled');

-- Group competitions table
CREATE TABLE IF NOT EXISTS public.group_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group1_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  group2_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  type competition_type NOT NULL,
  status competition_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ NOT NULL, -- Competition duration (e.g., 7 days)
  group1_score INTEGER NOT NULL DEFAULT 0, -- Total points/workouts during competition
  group2_score INTEGER NOT NULL DEFAULT 0,
  winner_group_id UUID REFERENCES public.groups(id), -- NULL if tie or not completed
  created_by UUID NOT NULL REFERENCES auth.users(id), -- Who initiated (group1 leader or challenger)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (group1_id != group2_id)
);

CREATE INDEX IF NOT EXISTS idx_competitions_group1 ON public.group_competitions(group1_id);
CREATE INDEX IF NOT EXISTS idx_competitions_group2 ON public.group_competitions(group2_id);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.group_competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_ends_at ON public.group_competitions(ends_at);

ALTER TABLE public.group_competitions ENABLE ROW LEVEL SECURITY;

-- Read: members of either group can see the competition
CREATE POLICY "Group members can read competitions"
  ON public.group_competitions FOR SELECT
  USING (
    group1_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    OR group2_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- Insert: group leaders can create competitions
CREATE POLICY "Group leaders can create competitions"
  ON public.group_competitions FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (
      (SELECT created_by FROM public.groups WHERE id = group1_id) = auth.uid()
      OR (SELECT created_by FROM public.groups WHERE id = group2_id) = auth.uid()
    )
  );

-- Update: group leaders can update (accept challenges, update scores)
CREATE POLICY "Group leaders can update competitions"
  ON public.group_competitions FOR UPDATE
  USING (
    (SELECT created_by FROM public.groups WHERE id = group1_id) = auth.uid()
    OR (SELECT created_by FROM public.groups WHERE id = group2_id) = auth.uid()
  );

-- Matchmaking queue: groups waiting to be matched
CREATE TABLE IF NOT EXISTS public.group_matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  queued_by UUID NOT NULL REFERENCES auth.users(id), -- Group leader who queued
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id) -- One entry per group
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_queued_at ON public.group_matchmaking_queue(queued_at);

ALTER TABLE public.group_matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Read: group members can see if their group is queued
CREATE POLICY "Group members can read matchmaking queue"
  ON public.group_matchmaking_queue FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- Insert: group leaders can queue
CREATE POLICY "Group leaders can queue for matchmaking"
  ON public.group_matchmaking_queue FOR INSERT
  WITH CHECK (
    auth.uid() = queued_by
    AND (SELECT created_by FROM public.groups WHERE id = group_id) = auth.uid()
  );

-- Delete: group leaders can remove from queue
CREATE POLICY "Group leaders can remove from queue"
  ON public.group_matchmaking_queue FOR DELETE
  USING (
    (SELECT created_by FROM public.groups WHERE id = group_id) = auth.uid()
  );

-- Competition member contributions: track individual member points during competition
CREATE TABLE IF NOT EXISTS public.competition_member_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.group_competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0, -- Points earned during competition period
  workouts_count INTEGER NOT NULL DEFAULT 0, -- Workouts logged during competition
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(competition_id, user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_contributions_competition ON public.competition_member_contributions(competition_id);
CREATE INDEX IF NOT EXISTS idx_contributions_user ON public.competition_member_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributions_group ON public.competition_member_contributions(group_id);

ALTER TABLE public.competition_member_contributions ENABLE ROW LEVEL SECURITY;

-- Read: members of either group can see contributions
DROP POLICY IF EXISTS "Group members can read contributions" ON public.competition_member_contributions;
CREATE POLICY "Group members can read contributions"
  ON public.competition_member_contributions FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    OR competition_id IN (
      SELECT id FROM public.group_competitions
      WHERE group1_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
      OR group2_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    )
  );

-- Insert: members can insert their own contributions
DROP POLICY IF EXISTS "Members can insert own contributions" ON public.competition_member_contributions;
CREATE POLICY "Members can insert own contributions"
  ON public.competition_member_contributions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- Update: members can update their own contributions
DROP POLICY IF EXISTS "Members can update own contributions" ON public.competition_member_contributions;
CREATE POLICY "Members can update own contributions"
  ON public.competition_member_contributions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to automatically match groups in queue (call this periodically or on queue insert)
CREATE OR REPLACE FUNCTION public.match_groups_in_queue()
RETURNS TABLE(competition_id UUID, group1_id UUID, group2_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group1_rec RECORD;
  group2_rec RECORD;
  new_competition_id UUID;
  competition_duration INTERVAL := '7 days'; -- Default 7-day competition
BEGIN
  -- Find two groups in queue (oldest first)
  FOR group1_rec IN
    SELECT * FROM public.group_matchmaking_queue
    ORDER BY queued_at ASC
    LIMIT 1
  LOOP
    -- Find another group (not the same one)
    FOR group2_rec IN
      SELECT * FROM public.group_matchmaking_queue
      WHERE group_id != group1_rec.group_id
      ORDER BY queued_at ASC
      LIMIT 1
    LOOP
      -- Create competition
      INSERT INTO public.group_competitions (
        group1_id,
        group2_id,
        type,
        status,
        started_at,
        ends_at,
        created_by
      ) VALUES (
        group1_rec.group_id,
        group2_rec.group_id,
        'matchmaking',
        'active',
        now(),
        now() + competition_duration,
        group1_rec.queued_by
      )
      RETURNING id INTO new_competition_id;

      -- Remove both from queue
      DELETE FROM public.group_matchmaking_queue WHERE id = group1_rec.id;
      DELETE FROM public.group_matchmaking_queue WHERE id = group2_rec.id;

      -- Return the match
      RETURN QUERY SELECT new_competition_id, group1_rec.group_id, group2_rec.group_id;
      
      RETURN; -- Exit after first match
    END LOOP;
  END LOOP;
END;
$$;

-- Function to calculate competition scores based on member contributions
CREATE OR REPLACE FUNCTION public.calculate_competition_scores(comp_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  comp_rec RECORD;
  group1_total INTEGER := 0;
  group2_total INTEGER := 0;
BEGIN
  SELECT * INTO comp_rec FROM public.group_competitions WHERE id = comp_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Sum points for group1
  SELECT COALESCE(SUM(points), 0) INTO group1_total
  FROM public.competition_member_contributions
  WHERE competition_id = comp_id AND group_id = comp_rec.group1_id;

  -- Sum points for group2
  SELECT COALESCE(SUM(points), 0) INTO group2_total
  FROM public.competition_member_contributions
  WHERE competition_id = comp_id AND group_id = comp_rec.group2_id;

  -- Update competition scores
  UPDATE public.group_competitions
  SET
    group1_score = group1_total,
    group2_score = group2_total,
    winner_group_id = CASE
      WHEN group1_total > group2_total THEN comp_rec.group1_id
      WHEN group2_total > group1_total THEN comp_rec.group2_id
      ELSE NULL -- Tie
    END
  WHERE id = comp_id;
END;
$$;

-- Function to update member contributions when a workout is posted during an active competition
CREATE OR REPLACE FUNCTION public.update_competition_contribution_on_workout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_competition RECORD;
  user_group_id UUID;
BEGIN
  -- Find if user is in any active competition
  FOR active_competition IN
    SELECT c.id, c.group1_id, c.group2_id, c.ends_at
    FROM public.group_competitions c
    WHERE c.status = 'active'
      AND c.started_at IS NOT NULL
      AND c.ends_at > now()
      AND (
        c.group1_id IN (SELECT group_id FROM public.group_members WHERE user_id = NEW.user_id)
        OR c.group2_id IN (SELECT group_id FROM public.group_members WHERE user_id = NEW.user_id)
      )
  LOOP
    -- Determine which group the user belongs to in this competition
    SELECT group_id INTO user_group_id
    FROM public.group_members
    WHERE user_id = NEW.user_id
      AND group_id IN (active_competition.group1_id, active_competition.group2_id)
    LIMIT 1;

    IF user_group_id IS NOT NULL THEN
      -- Upsert contribution (add 1 workout, add points based on workout)
      INSERT INTO public.competition_member_contributions (
        competition_id,
        user_id,
        group_id,
        workouts_count,
        points
      ) VALUES (
        active_competition.id,
        NEW.user_id,
        user_group_id,
        1,
        1 -- 1 point per workout (can be adjusted)
      )
      ON CONFLICT (competition_id, user_id, group_id)
      DO UPDATE SET
        workouts_count = competition_member_contributions.workouts_count + 1,
        points = competition_member_contributions.points + 1,
        updated_at = now();

      -- Recalculate competition scores
      PERFORM public.calculate_competition_scores(active_competition.id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger to update contributions when workout is created
DROP TRIGGER IF EXISTS on_workout_competition_update ON public.workouts;
CREATE TRIGGER on_workout_competition_update
  AFTER INSERT ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.update_competition_contribution_on_workout();

-- Function to complete expired competitions
CREATE OR REPLACE FUNCTION public.complete_expired_competitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update competitions that have ended
  UPDATE public.group_competitions
  SET status = 'completed'
  WHERE status = 'active'
    AND ends_at <= now();

  -- Recalculate final scores for completed competitions
  PERFORM public.calculate_competition_scores(id)
  FROM public.group_competitions
  WHERE status = 'completed'
    AND (group1_score = 0 AND group2_score = 0); -- Only recalc if scores haven't been set
END;
$$;
