-- Public minimum native app version for force-update checks (read by anon clients).
CREATE TABLE IF NOT EXISTS public.app_version_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  minimum_native_version text NOT NULL DEFAULT '1.0.0',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_version_config (id, minimum_native_version)
VALUES (1, '1.5.0')
ON CONFLICT (id) DO UPDATE SET
  minimum_native_version = excluded.minimum_native_version,
  updated_at = now();

ALTER TABLE public.app_version_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_version_config_select_anon"
  ON public.app_version_config
  FOR SELECT
  TO anon, authenticated
  USING (true);
