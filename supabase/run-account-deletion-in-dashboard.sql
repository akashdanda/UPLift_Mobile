-- Run this in Supabase Dashboard → SQL Editor
-- Creates a helper function to fully delete a user and their related data.

-- 1) Create RPC function to delete the current authenticated user and cascade related data.
--    Adjust the list of tables as needed for your schema.
create or replace function public.delete_user_and_data()
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete related data. Add additional tables as needed.
  delete from public.group_messages where user_id = v_user_id;
  delete from public.group_members where user_id = v_user_id;
  delete from public.group_invites where invited_user_id = v_user_id or invited_by = v_user_id;
  delete from public.workout_reactions where user_id = v_user_id;
  delete from public.workouts where user_id = v_user_id;
  delete from public.user_achievements where user_id = v_user_id;
  delete from public.profiles where id = v_user_id;

  -- Finally, delete the auth user.
  delete from auth.users where id = v_user_id;
end;
$$;

-- 2) Allow authenticated users to call the function.
grant execute on function public.delete_user_and_data() to authenticated;

