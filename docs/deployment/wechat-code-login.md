# 微信公众号验证码与可选扫码登录

## 方案

网页不再依赖微信公众号网页 OAuth。未登录用户默认在 `/account` 使用验证码登录：

1. 扫码关注微信公众号；
2. 在公众号对话中回复 `登录`（同时兼容 `登陆`、`【登录】`、`login`）；
3. 公众号被动回复 6 位一次性验证码；
4. 用户在网页输入验证码，服务端签发 Supabase Session。

这个默认流程只接收微信推送，不主动调用微信 API，因此不需要为 Vercel 配置固定出口 IP 或公众号 IP 白名单。扫码自动登录代码仍然保留，固定出口 IP 就绪后可以通过环境变量重新开启。

## 安全措施

- 验证码使用密码学随机数生成，只在公众号回复中出现；数据库仅保存带服务端密钥的 HMAC 摘要。
- 可选扫码登录二维码与浏览器 challenge 一一对应，普通固定公众号二维码不能建立浏览器登录状态。
- 扫码登录 challenge 只能由创建它的浏览器轮询和消费；成功消费、过期或失败后不能重复使用。
- 验证码默认 10 分钟有效、只能使用一次；同一微信用户默认 30 秒内不能重复生成。
- 网页验证按来源 IP 的 HMAC 摘要限流，默认每 10 分钟最多尝试 8 次。
- 验证码消费使用 `pending → consuming → consumed/failed` 状态流转，避免并发重复使用。
- OpenID、验证码、限流记录和 service role 操作都只存在于服务端。

## 数据库部署

迁移文件：

- `supabase/migrations/20260724000000_wechat_code_login.sql`

合并到 `main` 后，`.github/workflows/supabase-migration.yml` 会自动执行 dry-run 和 `supabase db push`。不需要在 Supabase Dashboard 手工执行 SQL。

新增表：

- `wechat_login_codes`
- `wechat_login_rate_limits`

新增 RPC：

- `take_wechat_login_attempt`
- `cleanup_wechat_code_login_artifacts`

## 微信公众号后台

服务器地址继续使用：

```text
https://YOUR_DOMAIN/api/wechat/callback
```

当前代码按明文消息模式验签和回复 XML。公众号后台配置的 Token 必须与部署环境的 `WECHAT_TOKEN` 一致。
默认验证码流程不需要服务端调用公众号 API。只有开启扫码自动登录或主动关注状态复核时，才必须把部署环境的固定出口 IP 加入公众号后台 IP 白名单。

## 环境变量

```bash
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_TOKEN=
WECHAT_LOGIN_HMAC_SECRET=
WECHAT_LOGIN_CHALLENGE_TTL_SECONDS=300

WECHAT_CODE_LOGIN_ENABLED=true
WECHAT_SCAN_LOGIN_ENABLED=false
WECHAT_FOLLOW_STATUS_REFRESH_ENABLED=false
WECHAT_CODE_LOGIN_TTL_SECONDS=600
WECHAT_CODE_LOGIN_COOLDOWN_SECONDS=30
WECHAT_CODE_LOGIN_MAX_ATTEMPTS=8
WECHAT_PUBLIC_ACCOUNT_NAME=烟火食间
WECHAT_PUBLIC_ACCOUNT_QR_URL=/wechat-official-account-qr.png

# 旧 OAuth 流程保持关闭
WECHAT_OAUTH_LOGIN_ENABLED=false
WECHAT_LOGIN_ENABLED=false
```

默认验证码登录使用 `WECHAT_PUBLIC_ACCOUNT_QR_URL`；未配置时使用仓库内置的 `/wechat-official-account-qr.png`。扫码自动登录必须使用服务端通过 AppID/AppSecret 创建的一次性参数二维码，并显式设置 `WECHAT_SCAN_LOGIN_ENABLED=true`。

## 上线检查

1. 合并到 `main`，确认 Supabase migration workflow 成功；
2. 确认生产环境已有 `WECHAT_TOKEN` 和至少 32 位的 `WECHAT_LOGIN_HMAC_SECRET`；
3. 设置 `WECHAT_SCAN_LOGIN_ENABLED=false` 和 `WECHAT_FOLLOW_STATUS_REFRESH_ENABLED=false`；
4. 设置公众号名称和稳定二维码图片；
5. 保持 `WECHAT_OAUTH_LOGIN_ENABLED=false`；
6. 真实微信关注公众号并回复【登录】，确认验证码登录、一次性、过期和错误次数限制正常；
7. 取消关注后确认微信回调能够及时撤销公共额度。
