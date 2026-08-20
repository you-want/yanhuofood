-- Menu date field migration.
-- Keep week_start for historical compatibility, while new code reads and writes start_date first.

ALTER TABLE menus ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS period_type TEXT DEFAULT 'week';
ALTER TABLE menus ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 2;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS preferences_snapshot JSONB;

UPDATE menus
SET start_date = week_start
WHERE start_date IS NULL;

CREATE INDEX IF NOT EXISTS menus_client_start_date_idx
  ON menus (client_id, start_date DESC);
