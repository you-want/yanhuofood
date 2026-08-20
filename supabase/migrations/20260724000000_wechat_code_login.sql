-- 微信公众号“回复【登录】获取验证码”登录。
-- 验证码只保存 HMAC 摘要；所有表和限流函数仅允许 service_role 使用。

CREATE TABLE IF NOT EXISTS wechat_login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wechat_openid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consuming', 'consumed', 'expired', 'failed')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  failure_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wechat_login_codes_openid_idx
  ON wechat_login_codes(wechat_openid, created_at DESC);
CREATE INDEX IF NOT EXISTS wechat_login_codes_expires_idx
  ON wechat_login_codes(expires_at);
CREATE INDEX IF NOT EXISTS wechat_login_codes_user_idx
  ON wechat_login_codes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wechat_login_rate_limits (
  client_hash TEXT PRIMARY KEY,
  window_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE wechat_login_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wechat_login_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE wechat_login_codes FROM anon, authenticated;
REVOKE ALL ON TABLE wechat_login_rate_limits FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wechat_login_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wechat_login_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION take_wechat_login_attempt(
  p_client_hash TEXT,
  p_max_attempts INTEGER DEFAULT 8,
  p_window_seconds INTEGER DEFAULT 600
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_window_started_at TIMESTAMP WITH TIME ZONE;
  v_attempt_count INTEGER;
  v_window_seconds INTEGER := GREATEST(60, LEAST(COALESCE(p_window_seconds, 600), 3600));
  v_max_attempts INTEGER := GREATEST(1, LEAST(COALESCE(p_max_attempts, 8), 50));
BEGIN
  IF p_client_hash IS NULL OR LENGTH(p_client_hash) < 16 THEN
    RETURN QUERY SELECT FALSE, v_window_seconds;
    RETURN;
  END IF;

  INSERT INTO wechat_login_rate_limits AS limits (
    client_hash,
    window_started_at,
    attempt_count,
    updated_at
  )
  VALUES (p_client_hash, v_now, 1, v_now)
  ON CONFLICT (client_hash) DO UPDATE SET
    window_started_at = CASE
      WHEN limits.window_started_at <= v_now - make_interval(secs => v_window_seconds) THEN v_now
      ELSE limits.window_started_at
    END,
    attempt_count = CASE
      WHEN limits.window_started_at <= v_now - make_interval(secs => v_window_seconds) THEN 1
      ELSE limits.attempt_count + 1
    END,
    updated_at = v_now
  RETURNING window_started_at, attempt_count
  INTO v_window_started_at, v_attempt_count;

  RETURN QUERY SELECT
    v_attempt_count <= v_max_attempts,
    CASE
      WHEN v_attempt_count <= v_max_attempts THEN 0
      ELSE GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (
          v_window_started_at + make_interval(secs => v_window_seconds) - v_now
        )))::INTEGER
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION take_wechat_login_attempt(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION take_wechat_login_attempt(TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION cleanup_wechat_code_login_artifacts()
RETURNS TABLE(deleted_codes BIGINT, deleted_rate_limits BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code_count BIGINT;
  rate_limit_count BIGINT;
BEGIN
  DELETE FROM wechat_login_codes
  WHERE expires_at < NOW() - INTERVAL '1 day'
     OR (status IN ('consumed', 'failed', 'expired') AND updated_at < NOW() - INTERVAL '1 day');
  GET DIAGNOSTICS code_count = ROW_COUNT;

  DELETE FROM wechat_login_rate_limits
  WHERE updated_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS rate_limit_count = ROW_COUNT;

  RETURN QUERY SELECT code_count, rate_limit_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_wechat_code_login_artifacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_wechat_code_login_artifacts() TO service_role;
