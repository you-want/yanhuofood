CREATE TABLE IF NOT EXISTS shopping_list_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  menu_start TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  menu_fingerprint TEXT NOT NULL DEFAULT '',
  item_states JSONB NOT NULL DEFAULT '{}'::JSONB,
  collapsed_categories JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS shopping_list_states_unique
  ON shopping_list_states(client_id, menu_start, date_from, date_to);

CREATE INDEX IF NOT EXISTS shopping_list_states_client_updated_idx
  ON shopping_list_states(client_id, updated_at DESC);
