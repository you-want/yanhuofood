-- 烟火食间 - 数据库 Schema
-- Supabase PostgreSQL 数据库初始化脚本

-- 用户偏好表
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

CREATE UNIQUE INDEX IF NOT EXISTS preferences_client_id_unique
  ON preferences (client_id);

-- 菜单表
CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  start_date DATE,
  end_date DATE,
  period_type TEXT DEFAULT 'week' CHECK (period_type IN ('day', 'week')),
  schema_version INTEGER DEFAULT 2,
  source TEXT,
  preferences_snapshot JSONB,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE menus ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS period_type TEXT DEFAULT 'week';
ALTER TABLE menus ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 2;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS preferences_snapshot JSONB;

UPDATE menus
SET start_date = week_start
WHERE start_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menus_client_start_date_unique
  ON menus (client_id, start_date);

-- 食谱表
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  client_id TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  name TEXT NOT NULL,
  cuisine TEXT,
  calories INTEGER,
  ingredients TEXT[],
  instructions TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE recipes ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE recipes ALTER COLUMN id SET DEFAULT gen_random_uuid()::TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- 产品事件表：只存白名单事件和白名单属性，不保存 API Key、完整 Prompt、完整模型输出或自由输入。
CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI 菜单生成日志表
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

-- AI 菜单异步生成任务表
CREATE TABLE IF NOT EXISTS menu_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  start_date DATE,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT DEFAULT 'queued',
  request JSONB NOT NULL,
  result JSONB,
  partial_result JSONB,
  completed_days INTEGER DEFAULT 0,
  total_days INTEGER,
  current_day INTEGER,
  warnings JSONB,
  heartbeat_at TIMESTAMP WITH TIME ZONE,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_preferences_client_id ON preferences(client_id);
CREATE INDEX IF NOT EXISTS idx_menus_client_id ON menus(client_id);
CREATE INDEX IF NOT EXISTS idx_menus_client_week ON menus(client_id, week_start);
CREATE INDEX IF NOT EXISTS menus_client_start_date_idx ON menus(client_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON recipes(cuisine);
CREATE INDEX IF NOT EXISTS recipes_client_id_idx ON recipes(client_id);
CREATE INDEX IF NOT EXISTS recipes_public_idx ON recipes(is_public);
CREATE INDEX IF NOT EXISTS menu_generation_logs_client_created_idx ON menu_generation_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS menu_generation_jobs_client_created_idx ON menu_generation_jobs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_events_client_created_idx ON product_events(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_events_name_created_idx ON product_events(event_name, created_at DESC);

-- 触发器：自动更新 updated_at
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

-- 初始示例数据（食谱）
INSERT INTO recipes (id, client_id, is_public, name, cuisine, calories, ingredients, instructions, tags) VALUES
('demo-1', NULL, TRUE, '番茄牛腩', '中式', 620, ARRAY['番茄','牛腩','洋葱','姜','蒜'], '牛腩切块焯水，番茄去皮切块，热油炒香调料，加入牛腩翻炒，加水炖煮1小时，最后加入番茄煮20分钟', ARRAY['家常菜','炖煮']),
('demo-2', NULL, TRUE, '宫保鸡丁', '中式', 580, ARRAY['鸡胸肉','花生米','干辣椒','花椒','葱'], '鸡胸肉切丁腌制，花生米炸香，热油爆香花椒辣椒，加入鸡丁翻炒，调味出锅', ARRAY['家常菜','川菜']),
('demo-3', NULL, TRUE, '香煎三文鱼', '西式', 520, ARRAY['三文鱼','柠檬','黑胡椒','橄榄油','芦笋'], '三文鱼用盐黑胡椒腌制，平底锅煎至两面金黄，搭配芦笋和柠檬', ARRAY['西餐','减脂']),
('demo-4', NULL, TRUE, '皮蛋瘦肉粥', '中式', 320, ARRAY['大米','皮蛋','瘦肉','葱花','姜'], '大米淘洗浸泡，瘦肉切丝腌制，皮蛋切丁，水开后加入大米煮至浓稠，加入瘦肉和皮蛋煮10分钟', ARRAY['早餐','粥类']),
('demo-5', NULL, TRUE, '清炒西兰花', '中式', 120, ARRAY['西兰花','大蒜','盐'], '西兰花切小朵焯水，热油爆香大蒜，加入西兰花翻炒，加盐调味出锅', ARRAY['素菜','健康'])
ON CONFLICT (id) DO NOTHING;

-- RLS 策略（如需启用）
-- ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can only view their own preferences" ON preferences
-- FOR SELECT USING (auth.uid() = client_id);

-- CREATE POLICY "Users can only insert their own preferences" ON preferences
-- FOR INSERT WITH CHECK (auth.uid() = client_id);

-- Optional aggregate daily quota protection for the server-side AMap key.
CREATE TABLE IF NOT EXISTS nearby_public_amap_daily_usage (
  quota_key TEXT NOT NULL,
  usage_date DATE NOT NULL,
  request_units INTEGER NOT NULL DEFAULT 0 CHECK (request_units >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quota_key, usage_date)
);

REVOKE ALL ON TABLE nearby_public_amap_daily_usage FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE nearby_public_amap_daily_usage TO service_role;

CREATE OR REPLACE FUNCTION consume_nearby_public_amap_quota(
  p_quota_key TEXT,
  p_usage_date DATE,
  p_limit INTEGER,
  p_units INTEGER
)
RETURNS TABLE (allowed BOOLEAN, used INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_used INTEGER;
BEGIN
  IF p_quota_key IS NULL OR BTRIM(p_quota_key) = '' OR p_limit <= 0 OR p_units <= 0 THEN
    RAISE EXCEPTION 'Invalid public AMap quota parameters';
  END IF;

  IF p_units <= p_limit THEN
    INSERT INTO nearby_public_amap_daily_usage (
      quota_key,
      usage_date,
      request_units,
      updated_at
    )
    VALUES (p_quota_key, p_usage_date, p_units, NOW())
    ON CONFLICT (quota_key, usage_date) DO UPDATE
      SET request_units = nearby_public_amap_daily_usage.request_units + EXCLUDED.request_units,
          updated_at = NOW()
      WHERE nearby_public_amap_daily_usage.request_units + EXCLUDED.request_units <= p_limit
    RETURNING request_units INTO current_used;
  END IF;

  IF current_used IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, current_used, GREATEST(0, p_limit - current_used);
    RETURN;
  END IF;

  SELECT request_units
    INTO current_used
    FROM nearby_public_amap_daily_usage
    WHERE quota_key = p_quota_key AND usage_date = p_usage_date;

  current_used := COALESCE(current_used, 0);
  RETURN QUERY SELECT FALSE, current_used, GREATEST(0, p_limit - current_used);
END;
$$;

REVOKE ALL ON FUNCTION consume_nearby_public_amap_quota(TEXT, DATE, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_nearby_public_amap_quota(TEXT, DATE, INTEGER, INTEGER)
  TO service_role;

-- 登录账户与微信公众号关注绑定；仅 service_role 访问，浏览器不能直接读取或写入。
CREATE TABLE IF NOT EXISTS app_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wechat_openid TEXT UNIQUE,
  wechat_unionid TEXT,
  wechat_status TEXT NOT NULL DEFAULT 'unbound' CHECK (wechat_status IN ('unbound', 'pending', 'following')),
  wechat_followed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wechat_binding_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wechat_binding_tokens_user_idx
  ON wechat_binding_tokens(user_id, created_at DESC);

ALTER TABLE app_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wechat_binding_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE wechat_binding_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wechat_binding_tokens TO service_role;

-- 微信公众号 OAuth 登录、跨设备扫码登录 challenge、关注状态复核。
ALTER TABLE app_accounts
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email'
    CHECK (auth_provider IN ('email', 'wechat', 'mixed')),
  ADD COLUMN IF NOT EXISTS wechat_status_checked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS disabled_reason TEXT;

UPDATE app_accounts
SET wechat_status_checked_at = COALESCE(wechat_status_checked_at, updated_at, NOW())
WHERE wechat_status = 'following' AND wechat_status_checked_at IS NULL;

CREATE TABLE IF NOT EXISTS wechat_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oauth_state_hash TEXT NOT NULL UNIQUE,
  browser_token_hash TEXT NOT NULL,
  mobile_confirm_token_hash TEXT,
  display_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirming', 'authorized', 'consuming', 'consumed', 'expired', 'failed')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wechat_openid TEXT,
  return_to TEXT NOT NULL DEFAULT '/account',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  authorized_at TIMESTAMP WITH TIME ZONE,
  consumed_at TIMESTAMP WITH TIME ZONE,
  failure_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wechat_login_challenges_expires_idx
  ON wechat_login_challenges(expires_at);
CREATE INDEX IF NOT EXISTS wechat_login_challenges_browser_idx
  ON wechat_login_challenges(browser_token_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS wechat_login_challenges_user_idx
  ON wechat_login_challenges(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wechat_access_tokens (
  token_key TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE wechat_login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE wechat_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wechat_login_challenges FROM anon, authenticated;
REVOKE ALL ON TABLE wechat_access_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wechat_login_challenges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wechat_access_tokens TO service_role;
-- 由运维定时任务调用，清理已经失效的一次性登录数据和过期 access token。
CREATE OR REPLACE FUNCTION cleanup_wechat_login_artifacts()
RETURNS TABLE(deleted_challenges BIGINT, deleted_tokens BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenge_count BIGINT;
  token_count BIGINT;
BEGIN
  DELETE FROM wechat_login_challenges
  WHERE expires_at < NOW() - INTERVAL '1 day'
     OR (status IN ('consumed', 'failed', 'expired') AND updated_at < NOW() - INTERVAL '1 day');
  GET DIAGNOSTICS challenge_count = ROW_COUNT;

  DELETE FROM wechat_access_tokens
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS token_count = ROW_COUNT;

  RETURN QUERY SELECT challenge_count, token_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_wechat_login_artifacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_wechat_login_artifacts() TO service_role;
