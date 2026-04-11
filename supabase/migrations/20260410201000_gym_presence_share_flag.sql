-- Allow check-in for posting even when the user opts out of showing on the public presence list.
ALTER TABLE public.gym_presence
  ADD COLUMN IF NOT EXISTS share_with_others boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.gym_presence.share_with_others IS
  'When false, user is checked in for app logic (e.g. posting) but hidden from others-at-gym UI.';
