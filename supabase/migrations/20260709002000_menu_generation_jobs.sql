-- AI menu generation jobs.
-- First version stores job state in Supabase; execution can later move from API route to a worker.

CREATE TABLE IF NOT EXISTS menu_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  start_date DATE,
  status TEXT NOT NULL DEFAULT 'queued',
  request JSONB NOT NULL,
  result JSONB,
  warnings JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS menu_generation_jobs_client_created_idx
  ON menu_generation_jobs (client_id, created_at DESC);
