-- Remove synthetic dev gym created by the old in-app QA flow (osm_id UPLIFT_DEV_TEST).
-- gym_presence for this gym is removed via ON DELETE CASCADE; workouts.gym_id becomes NULL.
DELETE FROM public.gyms
WHERE osm_id = 'UPLIFT_DEV_TEST';
