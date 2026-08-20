# 账户、微信登录与公众号授权

> 当前默认方案：扫描固定公众号二维码，关注后回复【登录】，再使用 6 位一次性验证码登录。扫码自动登录保留为需要固定出口 IP 的可选能力。具体配置见 [微信公众号验证码与可选扫码登录](./wechat-code-login.md)。
> 旧的公众号网页 OAuth 登录已停用；相关 Route Handler 和数据结构仅用于兼容，除非公众号后续具备网页授权条件，否则不要开启。

## 1. 授权规则

只有同时满足以下条件的用户，才可以使用部署环境中的 `OPENAI_API_KEY` 和 `AMAP_WEB_SERVICE_KEY`：

1. 已通过 Supabase Auth 登录；
2. 当前账户已绑定本公众号下的微信 OpenID；
3. 最近一次可用的关注状态为 `following`；
4. 账户未被停用。

用户在浏览器中自行配置的模型 Key 或高德 Key 继续只保存在 `localStorage`，不会写入 Supabase，也不受公众号关注状态限制。

## 2. 当前登录与绑定流程

### 新用户使用公众号验证码登录

1. 用户在 `/account` 查看固定公众号二维码；
2. 用户关注公众号并回复【登录】；
3. `/api/wechat/callback` 验证微信签名，以 OpenID 创建或查找账户并生成一次性验证码；
4. 用户将 6 位验证码提交到 `POST /api/auth/wechat/code/verify`；
5. 服务端原子领取验证码并为对应 Supabase 用户签发 Session。

### 已有邮箱账户绑定公众号

邮箱用户仍可使用原有登录入口。登录后可生成带场景参数的公众号二维码，将微信 OpenID 绑定到当前账户。系统不会自动合并两个已经独立创建的 Supabase 用户。

### 旧 OAuth 登录

`WECHAT_OAUTH_LOGIN_ENABLED` 必须保持为 `false`。兼容变量 `WECHAT_LOGIN_ENABLED` 已废弃，不能用于重新开启 OAuth 登录。

## 3. Supabase 迁移

相关 migration 按版本顺序自动应用：

```text
supabase/migrations/20260723000000_account_wechat_access.sql
supabase/migrations/20260723010000_wechat_login.sql
supabase/migrations/20260724000000_wechat_code_login.sql
```

合并到 `main` 后，`.github/workflows/supabase-migration.yml` 会执行 `supabase db push --dry-run` 和 `supabase db push`。不要在 Supabase Dashboard 重复手工执行这些 SQL。

验证码登录新增：

- `wechat_login_codes`：保存验证码 HMAC、状态、用户、OpenID 和过期时间；
- `wechat_login_rate_limits`：保存浏览器来源的 HMAC 限流窗口；
- `take_wechat_login_attempt()`：原子更新并判断验证码尝试次数；
- `cleanup_wechat_code_login_artifacts()`：清理过期验证码和限流记录。

建议通过 Supabase Cron 或其他计划任务每天至少调用一次：

```sql
select public.cleanup_wechat_code_login_artifacts();
```

旧登录结构仍可调用 `cleanup_wechat_login_artifacts()` 清理兼容记录。

## 4. 必要环境变量

```text
NEXT_PUBLIC_SITE_URL=https://你的域名
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
AMAP_WEB_SERVICE_KEY=

WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_TOKEN=
WECHAT_LOGIN_HMAC_SECRET=
WECHAT_REQUEST_TIMEOUT_MS=8000
WECHAT_QR_EXPIRE_SECONDS=600

WECHAT_CODE_LOGIN_ENABLED=true
WECHAT_SCAN_LOGIN_ENABLED=false
WECHAT_FOLLOW_STATUS_REFRESH_ENABLED=false
WECHAT_CODE_LOGIN_TTL_SECONDS=600
WECHAT_CODE_LOGIN_COOLDOWN_SECONDS=30
WECHAT_CODE_LOGIN_MAX_ATTEMPTS=8
WECHAT_PUBLIC_ACCOUNT_NAME=烟火食间
WECHAT_PUBLIC_ACCOUNT_QR_URL=/wechat-official-account-qr.png

WECHAT_OAUTH_LOGIN_ENABLED=false
WECHAT_LOGIN_ENABLED=false
WECHAT_FOLLOW_STATUS_FRESH_SECONDS=21600
WECHAT_FOLLOW_STATUS_MAX_STALE_SECONDS=86400
```

安全要求：

- `SUPABASE_SERVICE_ROLE_KEY`、`OPENAI_API_KEY`、`AMAP_WEB_SERVICE_KEY`、`WECHAT_APP_SECRET` 和 `WECHAT_LOGIN_HMAC_SECRET` 只能存在于服务端环境变量；
- `WECHAT_LOGIN_HMAC_SECRET` 使用至少 32 字符的高熵随机值，不与 AppSecret 或其他密钥复用；
- 不要给服务端密钥增加 `NEXT_PUBLIC_` 前缀；
- `WECHAT_PUBLIC_ACCOUNT_QR_URL` 可以使用仓库 `public/` 下图片对应的站内路径。

## 5. 微信公众平台配置

1. 将服务器地址设置为 `https://你的域名/api/wechat/callback`；
2. Token 必须与 `WECHAT_TOKEN` 完全一致；
3. 当前实现使用明文消息模式，兼容模式或安全模式需要额外实现消息体解密；
4. 确认公众号可以接收关注、扫码、取消关注和文本消息事件；
5. 默认验证码模式无需配置 IP 白名单；只有开启扫码自动登录或主动关注复核时才需要固定出口 IP；
6. 使用真实微信验证关注、回复验证码登录和取消关注后的授权撤销。

当前验证码方案不依赖公众号网页 OAuth，因此不要求配置网页授权回调。只有未来明确恢复 OAuth 方案时，才需要重新验证公众号资质和网页授权域名。

## 6. 服务端保护范围

站点公共模型配置用于：

- `POST /api/menus/generate`
- `POST /api/menus/generate-jobs`
- `POST /api/menus/replace`
- `POST /api/today-meal`
- `GET /api/model/test` 返回的站点模型可用状态

站点公共高德配置用于：

- `GET /api/nearby/status` 返回的公共配置状态；
- 未携带用户自有 Key 的 `/api/nearby/search`；
- 未携带用户自有 Key 的 `/api/nearby/geocode`；
- 未携带用户自有 Key 的 `/api/nearby/reverse-geocode`。

异步菜单任务在真正调用上游前会再次检查权限。所有授权判断都在 Route Handler 或服务端任务中完成，前端展示状态不能绕过权限校验。

## 7. 关注状态同步

- 回复登录关键词时将对应账户标记为 `following`；
- `subscribe` 和 `SCAN` 事件同步已知账户为 `following`；
- `unsubscribe` 事件立即写回 `unbound`；
- 默认关闭主动复核，只依赖微信关注、登录关键词和取消关注事件维护状态；
- 固定出口 IP 就绪后，可以设置 `WECHAT_FOLLOW_STATUS_REFRESH_ENABLED=true` 开启主动复核；
- 开启后默认 6 小时内使用缓存，复核失败且缓存超过 24 小时时关闭公共额度，但不影响用户自己的 Key。

公众号 access token 缓存在 `wechat_access_tokens`。当前刷新锁只覆盖单个 Node.js 实例；多实例部署出现明显竞争时再升级为数据库级协调。

## 8. 上线顺序

1. 合并 migration 到 `main`，确认 Supabase migration workflow 成功；
2. 检查表、索引、RLS、service role 权限和清理函数；
3. 配置公众号服务器回调和全部服务端环境变量；
4. 保持 `WECHAT_OAUTH_LOGIN_ENABLED=false`，开启 `WECHAT_CODE_LOGIN_ENABLED=true`；
5. 验证原邮箱登录、公众号绑定、本地模型 Key 和本地高德 Key 不受影响；
6. 使用真实微信完成关注、回复验证码、网页登录、验证码一次性和过期验证；
7. 验证未关注用户不能使用公共额度，关注后获得权限，取消关注后权限被撤销；
8. 观察验证码创建/消费失败、微信 API 错误、限流和公共额度拒绝日志。

## 9. 生产验收重点

- 真实 Supabase 环境中的用户创建、Session 签发和 Cookie 写入；
- 真实公众号消息回调、关注状态查询和取消关注事件；
- 验证码不可重用、超时失效、重发冷却和来源限流；
- 关键认证与授权路径的自动化集成测试；
- 清理函数定时执行、监控告警和回滚演练；
- 多实例 access token 刷新是否需要数据库级协调。
