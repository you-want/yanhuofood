-- Phase 0 baseline: product events, anonymous ownership, and dedupe-safe uniqueness.

UPDATE menus
SET start_date = week_start
WHERE start_date IS NULL;

WITH ranked_preferences AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM preferences
)
DELETE FROM preferences
WHERE id IN (
  SELECT id FROM ranked_preferences WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS preferences_client_id_unique
  ON preferences (client_id);

WITH ranked_menus AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, start_date
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM menus
  WHERE start_date IS NOT NULL
)
DELETE FROM menus
WHERE id IN (
  SELECT id FROM ranked_menus WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS menus_client_start_date_unique
  ON menus (client_id, start_date);

ALTER TABLE recipes ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE recipes ALTER COLUMN id SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

UPDATE recipes
SET is_public = TRUE
WHERE id IN ('demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5');

CREATE INDEX IF NOT EXISTS recipes_client_id_idx ON recipes(client_id);
CREATE INDEX IF NOT EXISTS recipes_public_idx ON recipes(is_public);

CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_events_client_created_idx
  ON product_events(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_events_name_created_idx
  ON product_events(event_name, created_at DESC);
