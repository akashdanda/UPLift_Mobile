-- Function to update streak when a workout is posted
CREATE OR REPLACE FUNCTION public.update_streak_on_workout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yesterday_date DATE;
  has_workout_yesterday BOOLEAN;
BEGIN
  -- Get yesterday's date
  yesterday_date := NEW.workout_date - INTERVAL '1 day';
  
  -- Check if user had a workout yesterday
  SELECT EXISTS(
    SELECT 1 
    FROM public.workouts 
    WHERE user_id = NEW.user_id 
    AND workout_date = yesterday_date
  ) INTO has_workout_yesterday;
  
  -- Update streak based on whether there was a workout yesterday
  IF has_workout_yesterday THEN
    -- Consecutive day: increment streak by 1
    UPDATE public.profiles
    SET streak = streak + 1
    WHERE id = NEW.user_id;
  ELSE
    -- No workout yesterday: start new streak at 1
    UPDATE public.profiles
    SET streak = 1
    WHERE id = NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add streak update to existing workout trigger
DROP TRIGGER IF EXISTS on_workout_created ON public.workouts;
CREATE TRIGGER on_workout_created
  AFTER INSERT ON public.workouts
  FOR EACH ROW 
  EXECUTE FUNCTION public.increment_workouts_count();

-- Create separate trigger for streak update
DROP TRIGGER IF EXISTS on_workout_created_streak ON public.workouts;
CREATE TRIGGER on_workout_created_streak
  AFTER INSERT ON public.workouts
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_streak_on_workout();

-- Function to check and reset streak if no workout today
CREATE OR REPLACE FUNCTION public.check_and_reset_streak(user_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date DATE;
  has_workout_today BOOLEAN;
BEGIN
  -- Get today's date
  today_date := CURRENT_DATE;
  
  -- Check if user has a workout today
  SELECT EXISTS(
    SELECT 1 
    FROM public.workouts 
    WHERE user_id = user_id_param 
    AND workout_date = today_date
  ) INTO has_workout_today;
  
  -- If no workout today, reset streak to 0
  IF NOT has_workout_today THEN
    UPDATE public.profiles
    SET streak = 0
    WHERE id = user_id_param;
  END IF;
END;
$$;
