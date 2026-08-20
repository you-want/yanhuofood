-- 登录账户、微信公众号关注绑定，以及服务端资源访问授权。
-- 这些表只允许 service_role 访问，浏览器永远不能直接读取或写入。
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
