-- ═══════════════════════════════════════════════
-- Run this in Supabase Dashboard → SQL Editor
-- Creates: duels table, workout_tags table, triggers, functions
-- ═══════════════════════════════════════════════

-- ──────────────────────────────────────────────
-- 1. Duels table
-- ──────────────────────────────────────────────
create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid references auth.users(id) on delete cascade not null,
  opponent_id uuid references auth.users(id) on delete cascade not null,
  type text not null default 'workout_count' check (type in ('streak', 'workout_count')),
  duration_days int not null default 7,
  status text not null default 'pending' check (status in ('pending', 'active', 'completed', 'declined', 'cancelled')),
  challenger_score int not null default 0,
  opponent_score int not null default 0,
  winner_id uuid references auth.users(id),
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_duels_challenger on public.duels(challenger_id);
create index if not exists idx_duels_opponent on public.duels(opponent_id);
create index if not exists idx_duels_status on public.duels(status);

-- RLS
alter table public.duels enable row level security;

drop policy if exists "Users can view their own duels" on public.duels;
create policy "Users can view their own duels" on public.duels
  for select using (
    auth.uid() = challenger_id or auth.uid() = opponent_id
  );

drop policy if exists "Authenticated users can create duels" on public.duels;
create policy "Authenticated users can create duels" on public.duels
  for insert with check (auth.uid() = challenger_id);

drop policy if exists "Participants can update their duels" on public.duels;
create policy "Participants can update their duels" on public.duels
  for update using (
    auth.uid() = challenger_id or auth.uid() = opponent_id
  );

-- ──────────────────────────────────────────────
-- 2. Function: update duel scores on workout insert
-- ──────────────────────────────────────────────
create or replace function public.update_duel_scores_on_workout()
returns trigger language plpgsql security definer as $$
declare
  d record;
  c_score int;
  o_score int;
begin
  for d in
    select * from public.duels
    where status = 'active'
      and (challenger_id = NEW.user_id or opponent_id = NEW.user_id)
      and NEW.workout_date >= (started_at::date)::text
      and NEW.workout_date <= (ends_at::date)::text
  loop
    if d.type = 'workout_count' then
      select count(*) into c_score
        from public.workouts
        where user_id = d.challenger_id
          and workout_date >= (d.started_at::date)::text
          and workout_date <= (d.ends_at::date)::text;

      select count(*) into o_score
        from public.workouts
        where user_id = d.opponent_id
          and workout_date >= (d.started_at::date)::text
          and workout_date <= (d.ends_at::date)::text;
    else
      select count(distinct workout_date) into c_score
        from public.workouts
        where user_id = d.challenger_id
          and workout_date >= (d.started_at::date)::text
          and workout_date <= (d.ends_at::date)::text;

      select count(distinct workout_date) into o_score
        from public.workouts
        where user_id = d.opponent_id
          and workout_date >= (d.started_at::date)::text
          and workout_date <= (d.ends_at::date)::text;
    end if;

    update public.duels
      set challenger_score = c_score,
          opponent_score = o_score,
          updated_at = now()
      where id = d.id;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_update_duel_scores on public.workouts;
create trigger trg_update_duel_scores
  after insert on public.workouts
  for each row
  execute function public.update_duel_scores_on_workout();

-- ──────────────────────────────────────────────
-- 3. Function: finalize expired duels
-- ──────────────────────────────────────────────
create or replace function public.finalize_expired_duels()
returns void language plpgsql security definer as $$
declare
  d record;
begin
  for d in
    select * from public.duels
    where status = 'active'
      and ends_at < now()
  loop
    update public.duels
      set status = 'completed',
          winner_id = case
            when d.challenger_score > d.opponent_score then d.challenger_id
            when d.opponent_score > d.challenger_score then d.opponent_id
            else null
          end,
          updated_at = now()
      where id = d.id;
  end loop;
end;
$$;

-- ──────────────────────────────────────────────
-- 4. Workout tags / mentions table
-- ──────────────────────────────────────────────
create table if not exists public.workout_tags (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid references public.workouts(id) on delete cascade not null,
  tagged_user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(workout_id, tagged_user_id)
);

create index if not exists idx_workout_tags_workout on public.workout_tags(workout_id);
create index if not exists idx_workout_tags_user on public.workout_tags(tagged_user_id);

-- RLS
alter table public.workout_tags enable row level security;

drop policy if exists "Users can view tags on visible workouts" on public.workout_tags;
create policy "Users can view tags on visible workouts" on public.workout_tags
  for select using (true);

drop policy if exists "Workout owner can add tags" on public.workout_tags;
create policy "Workout owner can add tags" on public.workout_tags
  for insert with check (
    exists (
      select 1 from public.workouts
      where id = workout_id and user_id = auth.uid()
    )
  );

drop policy if exists "Workout owner can remove tags" on public.workout_tags;
create policy "Workout owner can remove tags" on public.workout_tags
  for delete using (
    exists (
      select 1 from public.workouts
      where id = workout_id and user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- 5. Grant permissions
-- ──────────────────────────────────────────────
grant all on public.duels to authenticated;
grant all on public.workout_tags to authenticated;
