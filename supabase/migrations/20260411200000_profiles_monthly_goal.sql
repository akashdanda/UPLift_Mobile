-- Monthly goal: public text, at most one change per UTC calendar month.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_goal text,
  ADD COLUMN IF NOT EXISTS monthly_goal_month text;

COMMENT ON COLUMN public.profiles.monthly_goal IS 'Short public line for this period; cleared when period rolls if not refreshed.';
COMMENT ON COLUMN public.profiles.monthly_goal_month IS 'UTC YYYY-MM when monthly_goal was last written; enforces one update per month.';

CREATE OR REPLACE FUNCTION public.set_monthly_goal(p_goal text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month text := to_char((timezone('utc', now()))::date, 'YYYY-MM');
  v_existing text;
  t text := trim(coalesce(p_goal, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(t) = 0 THEN
    RAISE EXCEPTION 'Monthly goal cannot be empty';
  END IF;

  IF length(t) > 200 THEN
    RAISE EXCEPTION 'Monthly goal is too long (max 200 characters)';
  END IF;

  SELECT monthly_goal_month INTO v_existing FROM public.profiles WHERE id = v_uid FOR UPDATE;

  IF v_existing IS NOT NULL AND v_existing = v_month THEN
    RAISE EXCEPTION 'You already set your monthly goal for this month. Try again next month.';
  END IF;

  UPDATE public.profiles
  SET monthly_goal = t,
      monthly_goal_month = v_month
  WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_monthly_goal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_monthly_goal(text) TO authenticated;
