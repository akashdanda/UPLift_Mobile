-- Enable PostGIS
create extension if not exists postgis;

-- Gyms table
create table if not exists gyms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  location geography(Point, 4326),
  osm_id text unique,
  created_at timestamp with time zone default now()
);

create index if not exists gyms_location_idx on gyms using gist(location);

-- Nearby gyms RPC
create or replace function get_nearby_gyms(user_lat float, user_lng float, radius_meters float)
returns setof gyms as $$
  select * from gyms
  where ST_DWithin(
    location::geography,
    ST_Point(user_lng, user_lat)::geography,
    radius_meters
  );
$$ language sql stable;

-- Gym presence table
create table if not exists gym_presence (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  display_name text,
  avatar_url text,
  streak integer default 0,
  checked_in_at timestamp with time zone default now(),
  unique(user_id, gym_id)
);

-- RLS
alter table gyms enable row level security;
alter table gym_presence enable row level security;

create policy "Gyms are readable by all authenticated users"
  on gyms for select using (auth.role() = 'authenticated');

create policy "Anyone authenticated can insert gyms"
  on gyms for insert with check (auth.role() = 'authenticated');

create policy "Users can manage their own presence"
  on gym_presence for all using (auth.uid() = user_id);

create policy "Presence is readable by all authenticated users"
  on gym_presence for select using (auth.role() = 'authenticated');

-- Location visibility on profiles
alter table profiles add column if not exists location_visible boolean default false;
