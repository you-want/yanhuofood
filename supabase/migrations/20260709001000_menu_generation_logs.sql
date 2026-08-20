-- AI menu generation observability.
-- Store operational metadata only; do not store API keys, base URLs, full prompts, or full model output.

CREATE TABLE IF NOT EXISTS menu_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  start_date DATE,
  status TEXT NOT NULL,
  source TEXT,
  model TEXT,
  provider TEXT,
  duration_ms INTEGER,
  attempts JSONB,
  warnings JSONB,
  error_type TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS menu_generation_logs_client_created_idx
  ON menu_generation_logs (client_id, created_at DESC);
