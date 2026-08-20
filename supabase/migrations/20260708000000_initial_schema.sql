-- Initial database schema for a clean local or hosted Supabase project.

CREATE TABLE IF NOT EXISTS preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  cuisines TEXT,
  dietary_restrictions TEXT[],
  disliked_ingredients TEXT[],
  halal BOOLEAN DEFAULT FALSE,
  light_meal BOOLEAN DEFAULT FALSE,
  special_group TEXT CHECK (special_group IN ('children', 'elderly', 'pregnant')),
  energy_display TEXT DEFAULT 'auto' CHECK (energy_display IN ('auto', 'on', 'off')),
  days INTEGER DEFAULT 7 CHECK (days IN (5, 7)),
  diners_count INTEGER DEFAULT 1 CHECK (diners_count BETWEEN 1 AND 20),
  dishes_per_meal INTEGER DEFAULT 1 CHECK (dishes_per_meal BETWEEN 1 AND 6),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Text IDs support both generated UUID strings and stable demo recipe IDs.
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  cuisine TEXT,
  calories INTEGER,
  ingredients TEXT[],
  instructions TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preferences_client_id ON preferences(client_id);
CREATE INDEX IF NOT EXISTS idx_menus_client_id ON menus(client_id);
CREATE INDEX IF NOT EXISTS idx_menus_client_week ON menus(client_id, week_start);
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON recipes(cuisine);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_preferences_update BEFORE UPDATE ON preferences
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_menus_update BEFORE UPDATE ON menus
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_recipes_update BEFORE UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO recipes (id, name, cuisine, calories, ingredients, instructions, tags) VALUES
('demo-1', '番茄牛腩', '中式', 620, ARRAY['番茄','牛腩','洋葱','姜','蒜'], '牛腩切块焯水，番茄去皮切块，热油炒香调料，加入牛腩翻炒，加水炖煮1小时，最后加入番茄煮20分钟', ARRAY['家常菜','炖煮']),
('demo-2', '宫保鸡丁', '中式', 580, ARRAY['鸡胸肉','花生米','干辣椒','花椒','葱'], '鸡胸肉切丁腌制，花生米炸香，热油爆香花椒辣椒，加入鸡丁翻炒，调味出锅', ARRAY['家常菜','川菜']),
('demo-3', '香煎三文鱼', '西式', 520, ARRAY['三文鱼','柠檬','黑胡椒','橄榄油','芦笋'], '三文鱼用盐黑胡椒腌制，平底锅煎至两面金黄，搭配芦笋和柠檬', ARRAY['西餐','减脂']),
('demo-4', '皮蛋瘦肉粥', '中式', 320, ARRAY['大米','皮蛋','瘦肉','葱花','姜'], '大米淘洗浸泡，瘦肉切丝腌制，皮蛋切丁，水开后加入大米煮至浓稠，加入瘦肉和皮蛋煮10分钟', ARRAY['早餐','粥类']),
('demo-5', '清炒西兰花', '中式', 120, ARRAY['西兰花','大蒜','盐'], '西兰花切小朵焯水，热油爆香大蒜，加入西兰花翻炒，加盐调味出锅', ARRAY['素菜','健康'])
ON CONFLICT (id) DO NOTHING;
