-- 微信公众号 OAuth 登录、跨设备扫码登录 challenge、关注状态复核。
-- 所有敏感表只允许 service_role 访问。

ALTER TABLE app_accounts
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email'
    CHECK (auth_provider IN ('email', 'wechat', 'mixed')),
  ADD COLUMN IF NOT EXISTS wechat_status_checked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS disabled_reason TEXT;

-- 已经由微信事件确认关注的旧记录，以最后更新时间作为首次缓存时间，避免迁移后立即失去权限。
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

