-- Persist an auditable, secret-free snapshot of the final menu generation parameters.
ALTER TABLE menu_generation_logs
  ADD COLUMN IF NOT EXISTS parameter_snapshot JSONB;
