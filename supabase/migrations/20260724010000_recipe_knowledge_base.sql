-- Trusted recipe knowledge foundation. Existing legacy recipe fields remain available.

ALTER TABLE menu_generation_logs ADD COLUMN IF NOT EXISTS grounding JSONB;

CREATE TABLE IF NOT EXISTS recipe_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('system_curated', 'open_source', 'user_created', 'ai_generated', 'manual_import')),
  homepage_url TEXT,
  license_name TEXT,
  license_url TEXT,
  attribution_text TEXT,
  source_revision TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES recipe_sources(id),
  ADD COLUMN IF NOT EXISTS source_recipe_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS servings INTEGER,
  ADD COLUMN IF NOT EXISTS cooking_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS ingredient_details JSONB,
  ADD COLUMN IF NOT EXISTS steps JSONB,
  ADD COLUMN IF NOT EXISTS seasonings JSONB,
  ADD COLUMN IF NOT EXISTS nutrition JSONB,
  ADD COLUMN IF NOT EXISTS equipment TEXT[],
  ADD COLUMN IF NOT EXISTS dietary_flags TEXT[],
  ADD COLUMN IF NOT EXISTS health_goals TEXT[],
  ADD COLUMN IF NOT EXISTS meal_types TEXT[],
  ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_difficulty_check') THEN
    ALTER TABLE recipes ADD CONSTRAINT recipes_difficulty_check
      CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_quality_status_check') THEN
    ALTER TABLE recipes ADD CONSTRAINT recipes_quality_status_check
      CHECK (quality_status IN ('draft', 'normalized', 'reviewed', 'deprecated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_servings_check') THEN
    ALTER TABLE recipes ADD CONSTRAINT recipes_servings_check
      CHECK (servings IS NULL OR servings BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_cooking_time_check') THEN
    ALTER TABLE recipes ADD CONSTRAINT recipes_cooking_time_check
      CHECK (cooking_time_minutes IS NULL OR cooking_time_minutes > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  amount NUMERIC,
  unit TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  optional BOOLEAN NOT NULL DEFAULT FALSE,
  is_seasoning BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (recipe_id, position, is_seasoning)
);

CREATE TABLE IF NOT EXISTS ingredient_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recipes_source_id_idx ON recipes(source_id);
CREATE INDEX IF NOT EXISTS recipes_source_recipe_id_idx ON recipes(source_recipe_id);
CREATE INDEX IF NOT EXISTS recipes_quality_public_idx ON recipes(is_public, quality_status);
CREATE INDEX IF NOT EXISTS recipes_meal_types_idx ON recipes USING GIN(meal_types);
CREATE INDEX IF NOT EXISTS recipes_dietary_flags_idx ON recipes USING GIN(dietary_flags);
CREATE INDEX IF NOT EXISTS recipes_health_goals_idx ON recipes USING GIN(health_goals);
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_normalized_name_idx ON recipe_ingredients(normalized_name);
CREATE INDEX IF NOT EXISTS ingredient_aliases_normalized_name_idx ON ingredient_aliases(normalized_name);

DROP TRIGGER IF EXISTS trigger_recipe_sources_update ON recipe_sources;
CREATE TRIGGER trigger_recipe_sources_update BEFORE UPDATE ON recipe_sources
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO recipe_sources (
  slug, name, source_type, attribution_text, source_revision
) VALUES (
  'yanhuofood-curated-v1',
  '烟火食间系统精选菜谱',
  'system_curated',
  '由烟火食间维护的基础家常菜谱，用于菜单规划和结构化检索。',
  '2026-07-24'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  attribution_text = EXCLUDED.attribution_text,
  source_revision = EXCLUDED.source_revision;

UPDATE recipes
SET
  source_id = (SELECT id FROM recipe_sources WHERE slug = 'yanhuofood-curated-v1'),
  source_recipe_id = id,
  servings = COALESCE(servings, 2),
  schema_version = 2,
  quality_status = 'reviewed',
  imported_at = COALESCE(imported_at, NOW())
WHERE id LIKE 'demo-%';

INSERT INTO recipes (
  id, client_id, is_public, name, cuisine, calories, ingredients, instructions, tags,
  source_id, source_recipe_id, servings, cooking_time_minutes, prep_time_minutes, difficulty,
  ingredient_details, steps, seasonings, nutrition, equipment, dietary_flags, health_goals,
  meal_types, schema_version, quality_status, imported_at
)
SELECT
  seed.id, NULL, TRUE, seed.name, seed.cuisine, seed.calories, seed.ingredients, seed.instructions, seed.tags,
  source.id, seed.id, seed.servings, seed.cooking_time_minutes, seed.prep_time_minutes, seed.difficulty,
  seed.ingredient_details, seed.steps, seed.seasonings, seed.nutrition, seed.equipment, seed.dietary_flags,
  seed.health_goals, seed.meal_types, 2, 'reviewed', NOW()
FROM recipe_sources source
CROSS JOIN (VALUES
  (
    'system-tomato-egg-noodles', '番茄鸡蛋面', '中式', 480,
    ARRAY['面条','番茄','鸡蛋','小葱'],
    '番茄炒软后加水煮开，加入面条煮熟，淋入蛋液并调味。',
    ARRAY['快手','家常','一人食'], 2, 15, 5, 'easy',
    '[{"name":"面条","normalized_name":"面条","amount":200,"unit":"g","category":"grain"},{"name":"番茄","normalized_name":"番茄","amount":2,"unit":"个","category":"vegetable"},{"name":"鸡蛋","normalized_name":"鸡蛋","amount":2,"unit":"个","category":"egg_dairy"},{"name":"小葱","normalized_name":"小葱","amount":1,"unit":"根","category":"vegetable","optional":true}]'::jsonb,
    '[{"index":1,"instruction":"番茄切块，鸡蛋打散，面条和调味料备好。"},{"index":2,"instruction":"少量油炒熟鸡蛋后盛出，再把番茄炒软出汁。"},{"index":3,"instruction":"加水煮开，放入面条煮熟，加入鸡蛋并调味。"}]'::jsonb,
    '[{"name":"盐","normalized_name":"盐","unit":"适量","category":"seasoning"}]'::jsonb,
    '{"calories":480,"protein_g":19,"fat_g":12,"carbs_g":72,"fiber_g":5}'::jsonb,
    ARRAY['炒锅','汤锅'], ARRAY['vegetarian'], ARRAY['balanced'], ARRAY['breakfast','lunch','dinner']
  ),
  (
    'system-chicken-vegetable-rice', '鸡肉蔬菜焖饭', '中式', 560,
    ARRAY['大米','鸡腿肉','胡萝卜','香菇','青豆'],
    '鸡肉和蔬菜切小块调味，与大米一同放入电饭锅焖熟。',
    ARRAY['一锅料理','备餐','高蛋白'], 2, 40, 10, 'easy',
    '[{"name":"大米","normalized_name":"大米","amount":160,"unit":"g","category":"grain"},{"name":"去皮鸡腿肉","normalized_name":"鸡腿肉","amount":250,"unit":"g","category":"meat"},{"name":"胡萝卜","normalized_name":"胡萝卜","amount":100,"unit":"g","category":"vegetable"},{"name":"香菇","normalized_name":"香菇","amount":80,"unit":"g","category":"vegetable"},{"name":"青豆","normalized_name":"青豆","amount":60,"unit":"g","category":"vegetable","optional":true}]'::jsonb,
    '[{"index":1,"instruction":"大米淘洗，鸡肉、胡萝卜和香菇切小块。"},{"index":2,"instruction":"鸡肉用少量生抽腌制 10 分钟。"},{"index":3,"instruction":"所有食材放入电饭锅，按正常煮饭水量焖熟后拌匀。"}]'::jsonb,
    '[{"name":"生抽","normalized_name":"生抽","amount":15,"unit":"ml","category":"seasoning"},{"name":"盐","normalized_name":"盐","unit":"适量","category":"seasoning"}]'::jsonb,
    '{"calories":560,"protein_g":32,"fat_g":14,"carbs_g":75,"fiber_g":7}'::jsonb,
    ARRAY['电饭锅'], ARRAY[]::text[], ARRAY['balanced','high_protein','muscle_gain'], ARRAY['lunch','dinner']
  ),
  (
    'system-steamed-chicken-mushroom', '香菇蒸鸡', '中式', 390,
    ARRAY['鸡腿肉','香菇','姜','小葱'],
    '鸡肉和香菇调味后蒸熟，少油且适合家庭共享。',
    ARRAY['清淡','蒸菜','高蛋白'], 2, 30, 10, 'easy',
    '[{"name":"去皮鸡腿肉","normalized_name":"鸡腿肉","amount":300,"unit":"g","category":"meat"},{"name":"香菇","normalized_name":"香菇","amount":120,"unit":"g","category":"vegetable"},{"name":"姜","normalized_name":"姜","amount":10,"unit":"g","category":"vegetable"},{"name":"小葱","normalized_name":"小葱","amount":1,"unit":"根","category":"vegetable","optional":true}]'::jsonb,
    '[{"index":1,"instruction":"鸡肉切块，香菇切片，姜切丝。"},{"index":2,"instruction":"鸡肉与香菇、姜丝和调味料拌匀，腌制 10 分钟。"},{"index":3,"instruction":"水开后上锅蒸约 18 分钟，确认鸡肉熟透后撒葱花。"}]'::jsonb,
    '[{"name":"生抽","normalized_name":"生抽","amount":12,"unit":"ml","category":"seasoning"},{"name":"盐","normalized_name":"盐","unit":"少量","category":"seasoning"}]'::jsonb,
    '{"calories":390,"protein_g":39,"fat_g":19,"carbs_g":12,"fiber_g":2}'::jsonb,
    ARRAY['蒸锅'], ARRAY[]::text[], ARRAY['balanced','high_protein','fat_loss'], ARRAY['lunch','dinner']
  ),
  (
    'system-tofu-vegetable-soup', '豆腐蔬菜汤', '中式', 260,
    ARRAY['北豆腐','白菜','番茄','香菇'],
    '蔬菜煮软后加入豆腐稍煮并清淡调味。',
    ARRAY['清淡','素食','快手'], 2, 20, 8, 'easy',
    '[{"name":"北豆腐","normalized_name":"豆腐","amount":300,"unit":"g","category":"soy"},{"name":"白菜","normalized_name":"白菜","amount":200,"unit":"g","category":"vegetable"},{"name":"番茄","normalized_name":"番茄","amount":1,"unit":"个","category":"vegetable"},{"name":"香菇","normalized_name":"香菇","amount":80,"unit":"g","category":"vegetable","optional":true}]'::jsonb,
    '[{"index":1,"instruction":"豆腐切块，白菜、番茄和香菇切好。"},{"index":2,"instruction":"锅中加水，先煮番茄和香菇，再加入白菜。"},{"index":3,"instruction":"蔬菜变软后加入豆腐煮 5 分钟，少量盐调味。"}]'::jsonb,
    '[{"name":"盐","normalized_name":"盐","unit":"适量","category":"seasoning"},{"name":"白胡椒","normalized_name":"白胡椒","unit":"少量","category":"seasoning","optional":true}]'::jsonb,
    '{"calories":260,"protein_g":21,"fat_g":12,"carbs_g":20,"fiber_g":6}'::jsonb,
    ARRAY['汤锅'], ARRAY['vegetarian'], ARRAY['balanced','fat_loss'], ARRAY['lunch','dinner']
  ),
  (
    'system-oat-yogurt-bowl', '燕麦酸奶水果碗', '西式', 360,
    ARRAY['燕麦片','无糖酸奶','香蕉','蓝莓','坚果'],
    '燕麦、酸奶和水果分层放入碗中，撒少量坚果即可。',
    ARRAY['早餐','免烹饪','快手'], 1, 5, 5, 'easy',
    '[{"name":"即食燕麦片","normalized_name":"燕麦片","amount":45,"unit":"g","category":"grain"},{"name":"无糖酸奶","normalized_name":"酸奶","amount":180,"unit":"g","category":"egg_dairy"},{"name":"香蕉","normalized_name":"香蕉","amount":0.5,"unit":"根","category":"fruit"},{"name":"蓝莓","normalized_name":"蓝莓","amount":50,"unit":"g","category":"fruit","optional":true},{"name":"坚果","normalized_name":"坚果","amount":10,"unit":"g","category":"other","optional":true}]'::jsonb,
    '[{"index":1,"instruction":"燕麦片放入碗底，加入无糖酸奶。"},{"index":2,"instruction":"铺上切片香蕉和蓝莓，最后撒少量坚果。"}]'::jsonb,
    '[]'::jsonb,
    '{"calories":360,"protein_g":15,"fat_g":10,"carbs_g":55,"fiber_g":8}'::jsonb,
    ARRAY[]::text[], ARRAY['vegetarian'], ARRAY['balanced','fat_loss'], ARRAY['breakfast']
  ),
  (
    'system-shrimp-broccoli', '西兰花炒虾仁', '中式', 330,
    ARRAY['虾仁','西兰花','大蒜'],
    '西兰花焯水，虾仁炒至变色后与西兰花快速翻炒。',
    ARRAY['快手','高蛋白','减脂'], 2, 18, 8, 'easy',
    '[{"name":"虾仁","normalized_name":"虾仁","amount":250,"unit":"g","category":"seafood"},{"name":"西兰花","normalized_name":"西兰花","amount":300,"unit":"g","category":"vegetable"},{"name":"大蒜","normalized_name":"大蒜","amount":2,"unit":"瓣","category":"vegetable"}]'::jsonb,
    '[{"index":1,"instruction":"西兰花切小朵并焯水，虾仁擦干。"},{"index":2,"instruction":"少量油炒香大蒜，加入虾仁炒至变色。"},{"index":3,"instruction":"加入西兰花快速翻炒并调味。"}]'::jsonb,
    '[{"name":"盐","normalized_name":"盐","unit":"适量","category":"seasoning"},{"name":"黑胡椒","normalized_name":"黑胡椒","unit":"少量","category":"seasoning","optional":true}]'::jsonb,
    '{"calories":330,"protein_g":42,"fat_g":11,"carbs_g":18,"fiber_g":8}'::jsonb,
    ARRAY['炒锅'], ARRAY[]::text[], ARRAY['high_protein','fat_loss','low_sugar'], ARRAY['lunch','dinner']
  ),
  (
    'system-pumpkin-millet-porridge', '南瓜小米粥', '中式', 280,
    ARRAY['小米','南瓜'],
    '小米和南瓜一同慢煮至软糯。',
    ARRAY['早餐','清淡','老人友好'], 2, 35, 5, 'easy',
    '[{"name":"小米","normalized_name":"小米","amount":100,"unit":"g","category":"grain"},{"name":"南瓜","normalized_name":"南瓜","amount":250,"unit":"g","category":"vegetable"}]'::jsonb,
    '[{"index":1,"instruction":"小米淘洗，南瓜去皮切小块。"},{"index":2,"instruction":"锅中加水，放入小米和南瓜煮开。"},{"index":3,"instruction":"转小火煮至小米开花、南瓜软烂。"}]'::jsonb,
    '[]'::jsonb,
    '{"calories":280,"protein_g":7,"fat_g":3,"carbs_g":58,"fiber_g":5}'::jsonb,
    ARRAY['汤锅'], ARRAY['vegetarian'], ARRAY['balanced'], ARRAY['breakfast']
  ),
  (
    'system-beef-pepper-stir-fry', '彩椒牛肉丝', '中式', 450,
    ARRAY['牛肉','彩椒','洋葱'],
    '牛肉丝快速滑炒后加入彩椒和洋葱炒至断生。',
    ARRAY['快手','高蛋白','家常'], 2, 20, 10, 'medium',
    '[{"name":"瘦牛肉","normalized_name":"牛肉","amount":260,"unit":"g","category":"meat"},{"name":"彩椒","normalized_name":"彩椒","amount":200,"unit":"g","category":"vegetable"},{"name":"洋葱","normalized_name":"洋葱","amount":100,"unit":"g","category":"vegetable"}]'::jsonb,
    '[{"index":1,"instruction":"牛肉逆纹切丝，彩椒和洋葱切丝。"},{"index":2,"instruction":"牛肉用少量生抽和淀粉抓匀，快速滑炒至变色后盛出。"},{"index":3,"instruction":"炒香洋葱和彩椒，放回牛肉快速翻匀。"}]'::jsonb,
    '[{"name":"生抽","normalized_name":"生抽","amount":12,"unit":"ml","category":"seasoning"},{"name":"淀粉","normalized_name":"淀粉","amount":5,"unit":"g","category":"seasoning"}]'::jsonb,
    '{"calories":450,"protein_g":38,"fat_g":22,"carbs_g":24,"fiber_g":5}'::jsonb,
    ARRAY['炒锅'], ARRAY[]::text[], ARRAY['high_protein','muscle_gain','balanced'], ARRAY['lunch','dinner']
  )
) AS seed(
  id, name, cuisine, calories, ingredients, instructions, tags, servings,
  cooking_time_minutes, prep_time_minutes, difficulty, ingredient_details, steps,
  seasonings, nutrition, equipment, dietary_flags, health_goals, meal_types
)
WHERE source.slug = 'yanhuofood-curated-v1'
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  cuisine = EXCLUDED.cuisine,
  calories = EXCLUDED.calories,
  ingredients = EXCLUDED.ingredients,
  instructions = EXCLUDED.instructions,
  tags = EXCLUDED.tags,
  source_id = EXCLUDED.source_id,
  source_recipe_id = EXCLUDED.source_recipe_id,
  servings = EXCLUDED.servings,
  cooking_time_minutes = EXCLUDED.cooking_time_minutes,
  prep_time_minutes = EXCLUDED.prep_time_minutes,
  difficulty = EXCLUDED.difficulty,
  ingredient_details = EXCLUDED.ingredient_details,
  steps = EXCLUDED.steps,
  seasonings = EXCLUDED.seasonings,
  nutrition = EXCLUDED.nutrition,
  equipment = EXCLUDED.equipment,
  dietary_flags = EXCLUDED.dietary_flags,
  health_goals = EXCLUDED.health_goals,
  meal_types = EXCLUDED.meal_types,
  schema_version = EXCLUDED.schema_version,
  quality_status = EXCLUDED.quality_status,
  updated_at = NOW();

INSERT INTO ingredient_aliases(alias, normalized_name, category) VALUES
  ('西红柿', '番茄', 'vegetable'),
  ('番茄', '番茄', 'vegetable'),
  ('马铃薯', '土豆', 'vegetable'),
  ('土豆', '土豆', 'vegetable'),
  ('鸡脯肉', '鸡胸肉', 'meat'),
  ('鸡胸', '鸡胸肉', 'meat'),
  ('鸡腿', '鸡腿肉', 'meat'),
  ('去皮鸡腿肉', '鸡腿肉', 'meat'),
  ('青葱', '小葱', 'vegetable'),
  ('香葱', '小葱', 'vegetable'),
  ('酱油', '生抽', 'seasoning'),
  ('北豆腐', '豆腐', 'soy'),
  ('嫩豆腐', '豆腐', 'soy'),
  ('酸奶', '酸奶', 'egg_dairy'),
  ('无糖酸奶', '酸奶', 'egg_dairy')
ON CONFLICT (alias) DO UPDATE SET
  normalized_name = EXCLUDED.normalized_name,
  category = EXCLUDED.category;

DELETE FROM recipe_ingredients
WHERE recipe_id IN (
  SELECT id FROM recipes
  WHERE source_id = (SELECT id FROM recipe_sources WHERE slug = 'yanhuofood-curated-v1')
    AND ingredient_details IS NOT NULL
);

INSERT INTO recipe_ingredients (
  recipe_id, position, name, normalized_name, amount, unit, category, optional, is_seasoning
)
SELECT
  r.id,
  ingredient.ordinality - 1,
  ingredient.value->>'name',
  COALESCE(ingredient.value->>'normalized_name', ingredient.value->>'name'),
  NULLIF(ingredient.value->>'amount', '')::numeric,
  ingredient.value->>'unit',
  COALESCE(ingredient.value->>'category', 'other'),
  COALESCE((ingredient.value->>'optional')::boolean, FALSE),
  FALSE
FROM recipes r
CROSS JOIN LATERAL jsonb_array_elements(r.ingredient_details) WITH ORDINALITY AS ingredient(value, ordinality)
WHERE r.source_id = (SELECT id FROM recipe_sources WHERE slug = 'yanhuofood-curated-v1');

INSERT INTO recipe_ingredients (
  recipe_id, position, name, normalized_name, amount, unit, category, optional, is_seasoning
)
SELECT
  r.id,
  seasoning.ordinality - 1,
  seasoning.value->>'name',
  COALESCE(seasoning.value->>'normalized_name', seasoning.value->>'name'),
  NULLIF(seasoning.value->>'amount', '')::numeric,
  seasoning.value->>'unit',
  COALESCE(seasoning.value->>'category', 'seasoning'),
  COALESCE((seasoning.value->>'optional')::boolean, FALSE),
  TRUE
FROM recipes r
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.seasonings, '[]'::jsonb)) WITH ORDINALITY AS seasoning(value, ordinality)
WHERE r.source_id = (SELECT id FROM recipe_sources WHERE slug = 'yanhuofood-curated-v1');

GRANT SELECT, INSERT, UPDATE, DELETE ON recipe_sources, recipe_ingredients, ingredient_aliases TO service_role;
