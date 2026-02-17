-- Store Expo push token for sending daily reminder (and future) push notifications.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

COMMENT ON COLUMN public.profiles.expo_push_token IS 'Expo push token (ExpoPushToken) for push notifications; set by app when user grants permission.';
