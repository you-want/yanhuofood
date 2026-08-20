-- Progressive menu generation state. Existing APIs keep a result-column fallback
-- until this migration has been applied in every environment.

ALTER TABLE menu_generation_jobs ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'queued';
ALTER TABLE menu_generation_jobs ADD COLUMN IF NOT EXISTS partial_result JSONB;
ALTER TABLE menu_generation_jobs ADD COLUMN IF NOT EXISTS completed_days INTEGER DEFAULT 0;
ALTER TABLE menu_generation_jobs ADD COLUMN IF NOT EXISTS total_days INTEGER;
ALTER TABLE menu_generation_jobs ADD COLUMN IF NOT EXISTS current_day INTEGER;
ALTER TABLE menu_generation_jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE menu_generation_jobs ADD COLUMN IF NOT EXISTS error_code TEXT;

