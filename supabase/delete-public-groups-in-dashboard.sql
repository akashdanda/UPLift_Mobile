-- Run this in Supabase Dashboard → SQL Editor
-- Deletes ALL existing PUBLIC groups (and their memberships via ON DELETE CASCADE).
-- Does NOT remove any features/schema—only existing rows.

begin;

-- Preview what will be deleted
select
  count(*) as public_groups_to_delete
from public.groups
where is_public = true;

-- Optional: list them
-- select id, name, description, created_by, created_at
-- from public.groups
-- where is_public = true
-- order by created_at desc;

-- Delete public groups (group_members rows will cascade-delete)
delete from public.groups
where is_public = true;

commit;

