
CREATE TABLE public.girigo_sessions (
  name_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  end_at BIGINT NOT NULL,
  paused BOOLEAN NOT NULL DEFAULT false,
  paused_remaining BIGINT,
  reprieved BOOLEAN NOT NULL DEFAULT false,
  reprieved_at BIGINT,
  updated_at BIGINT NOT NULL
);

GRANT ALL ON public.girigo_sessions TO service_role;

ALTER TABLE public.girigo_sessions ENABLE ROW LEVEL SECURITY;

-- No public policies: all reads/writes flow through the server route using service_role.
CREATE POLICY "service_role manages sessions"
  ON public.girigo_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
