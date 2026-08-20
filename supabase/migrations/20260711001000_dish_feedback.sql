CREATE TABLE IF NOT EXISTS dish_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  dish_name TEXT NOT NULL,
  dish_key TEXT NOT NULL,
  liked BOOLEAN NOT NULL DEFAULT FALSE,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  cooked BOOLEAN NOT NULL DEFAULT FALSE,
  source_menu_start TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dish_feedback_client_dish_key_unique
  ON dish_feedback(client_id, dish_key);

CREATE INDEX IF NOT EXISTS dish_feedback_client_updated_idx
  ON dish_feedback(client_id, updated_at DESC);
