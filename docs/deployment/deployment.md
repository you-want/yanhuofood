# 烟火食间部署说明

## 推荐部署方式：Vercel

本项目是 Next.js App Router 项目，适合直接部署到 Vercel。Vercel 对 Next.js 提供零配置部署、GitHub 集成、Preview Deployments 和自定义域名能力。

参考官方文档：

- Next.js on Vercel: https://vercel.com/docs/frameworks/nextjs
- Environment Variables: https://vercel.com/docs/projects/environment-variables
- Domains: https://vercel.com/docs/domains

## GitHub + Vercel 流程

1. 将项目提交到 GitHub。
2. 登录 Vercel，选择 `Add New Project`。
3. 导入 GitHub 仓库。
4. Framework Preset 选择 `Next.js`。
5. Build Command 使用默认 `next build`，本项目 `package.json` 中已配置 `pnpm build`。
6. 在 Environment Variables 中配置生产环境变量。
7. 点击 Deploy。

## 必要环境变量

复制 `.env.example` 中的变量，在 Vercel Project Settings 里配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=https://your-domain.com
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini
OPENAI_REQUEST_TIMEOUT_MS=
```

说明：

- `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 会暴露给浏览器，必须使用 Supabase anon key。
- `SUPABASE_SERVICE_ROLE_KEY` 只用于服务端 API，不能暴露到客户端。
- `NEXT_PUBLIC_SITE_URL` 用于生成 OpenGraph、分享图片等绝对 URL，配置成你的正式域名。
- `OPENAI_API_KEY` 是服务器默认模型配置。用户也可以在页面里配置自己的模型 Key，该配置只保存在用户当前浏览器。
- `OPENAI_BASE_URL` 可选，用于 OpenAI 兼容接口，例如阿里云百炼兼容模式地址。
- `OPENAI_MODEL` 可选，默认 `gpt-4o-mini`。
- `OPENAI_REQUEST_TIMEOUT_MS` 可选，用于覆盖 AI 生成与自动修复共享的总时间预算。未配置时，1/5/7 天菜单分别使用 30/60/90 秒。

账户、微信公众号扫码/验证码登录和公共资源授权还需要配置微信相关服务端变量，详见 [账户、微信登录与公众号授权](./account-wechat-access.md)。

## 自定义域名

1. 在 Vercel 项目中进入 `Settings -> Domains`。
2. 添加你的域名，例如 `yanhuofood.com` 或 `food.example.com`。
3. 按 Vercel 页面提示配置 DNS：
   - 根域名通常配置 A 记录。
   - 子域名通常配置 CNAME。
4. 等待 Vercel 自动签发 HTTPS 证书。

## 用户本地模型配置机制

本项目支持两类模型配置：

- 服务器默认配置：通过 Vercel 环境变量 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL` 配置，所有用户默认使用。
- 用户本浏览器配置：用户在偏好页填写 API Key、模型名和 Base URL，配置保存到当前浏览器 `localStorage`，不会写入 Supabase，也不会同步给其他用户。

生成菜单时，如果用户启用了本浏览器模型配置，前端会把配置随本次请求临时发给服务端用于调用模型。服务端不会保存这份配置。

安全边界：

- 用户本地配置只适合个人使用。
- 浏览器 localStorage 不是高安全级别密钥保险箱，不建议在公共电脑上保存 API Key。
- 如果要做更强安全模型，后续应引入用户账号和加密托管的个人密钥方案。

## 附近餐馆地图服务

部署 `/nearby` 功能时，可以选择配置站点公共高德 Key：

```bash
AMAP_WEB_SERVICE_KEY=your_amap_webservice_key
AMAP_REQUEST_TIMEOUT_MS=8000
# 可选：站点公共 Key 每日调用单位总上限，推荐先从 150 开始
AMAP_PUBLIC_DAILY_REQUEST_LIMIT=150
AMAP_PUBLIC_QUOTA_TIME_ZONE=Asia/Shanghai
AMAP_PUBLIC_QUOTA_BUCKET=production
```

`AMAP_WEB_SERVICE_KEY` 不是必填项。未配置时，用户可以在 `/nearby` 页面填写自己的高德 **Web 服务 Key**；该 Key 保存在当前浏览器的 `yanhuofood.localAmapConfig`，并只在地址解析和附近搜索请求中临时发送给当前站点后端。

配置优先级：

1. 用户当前浏览器已启用的本地 Key。
2. 服务端环境变量 `AMAP_WEB_SERVICE_KEY`。
3. 两者都没有时，页面显示配置引导，API 返回 `MAP_PROVIDER_NOT_CONFIGURED`。

### 公共 Key 每日额度保护

`AMAP_PUBLIC_DAILY_REQUEST_LIMIT` 可以配置站点公共 Key 的每日硬上限。它按**高德上游请求单位**计数，而不是按页面按钮点击计数：

- 地址解析：1 个单位。
- 高德坐标附近搜索或逆地理编码：1 个单位。
- GPS 坐标附近搜索或逆地理编码：2 个单位，因为需要额外进行一次坐标转换。
- 一次常见的“GPS 定位 → 逆地理编码 → 附近搜索”完整流程通常是 3 个单位。

建议小规模上线先配置为 `150`，约可支持每天 50 次完整 GPS 定位搜索流程，并为当前高德个人开发者搜索配额保留较大余量。正式值应根据高德控制台中的实际套餐、近 7 天使用量和站点活跃用户调整；提高额度前先确认最新官方配额和计费规则。

配置语义：

- `0`、未配置、非法值或超过 `1000000`：关闭应用侧每日限制。
- `AMAP_PUBLIC_QUOTA_TIME_ZONE`：决定每日何时清零，非法时回退为 `Asia/Shanghai`。
- `AMAP_PUBLIC_QUOTA_BUCKET`：同一个 Supabase 项目中隔离 production、staging 等环境的计数。
- 用户本浏览器 Key 始终绕过公共额度，不消耗站点计数。

额度计数使用 Supabase 的原子 PostgreSQL RPC。启用限制前必须先应用迁移：

```bash
supabase db push
```

对应迁移文件：`supabase/migrations/20260722001000_nearby_public_amap_daily_quota.sql`。

计数表只保存日期、环境 bucket 和汇总调用单位，不保存用户 ID、IP、地址、坐标或任何 Key。若额度限制已开启，但 Supabase、service role key、表或 RPC 不可用，API 会返回 `PUBLIC_MAP_QUOTA_UNAVAILABLE` 并暂停公共 Key；这是为了在计数失效时避免意外费用。达到上限时返回 `PUBLIC_MAP_DAILY_LIMIT_REACHED`，页面会引导用户填写自己的 Key。

安全与运维要求：

- 无论用户 Key 还是公共 Key，都必须使用高德“Web 服务”类型，而不是“Web JS API”类型。
- 公共 Key 不得出现在 `NEXT_PUBLIC_*`、客户端 JavaScript、分析事件或普通错误日志中。
- 用户 Key 不写入 Supabase、分析事件或日志；服务端仅在单次请求生命周期中使用。
- 浏览器 localStorage 不是高安全级别密钥保险箱，应提醒用户不要在公用或不可信设备上保存个人 Key。
- 如果用户 Key 配置了 IP 白名单，需要允许部署站点后端的出口 IP，因为请求由 Next.js Route Handler 发往高德。
- `/api/nearby/search` 和 `/api/nearby/geocode` 只在单次请求中使用位置，不把精确坐标写入 Supabase。
- 第三方 POI 的评分、价格和营业时间可能缺失或有延迟；页面必须保留数据时效提示。
- 外卖配送、配送费、起送价、菜单库存、优惠和送达时间需要通过官方合作数据源另行实现。

## Supabase 邮箱验证回跳地址

仓库的 `.github/workflows/supabase-auth-config.yml` 会在相关配置合并到 `main` 后，通过 Supabase Management API 自动确保以下配置。也可以在 Supabase Dashboard 的 **Authentication → URL Configuration** 中核对：

- Site URL：`https://www.yanhuofood.com`
- Redirect URLs：
  - `https://www.yanhuofood.com/account`
  - `http://localhost:3000/account`
  - `http://127.0.0.1:3000/account`

如果生产 Site URL 仍为 `http://localhost:3000`，或生产 `/account` 不在 Redirect URLs 允许列表中，Supabase 会忽略应用传入的回跳地址，确认邮件点击后会落到 localhost。自动配置依赖 GitHub Actions Secret `SUPABASE_ACCESS_TOKEN` 具备 Auth Config 写权限；workflow 失败时再到 Dashboard 手动核对。

如果修改过 Supabase 的 Confirm signup 邮件模板，确认链接应使用 `{{ .ConfirmationURL }}`；如果模板自行拼接确认地址并使用了 `redirectTo`，回跳部分应使用 `{{ .RedirectTo }}`，不要固定写 `{{ .SiteURL }}` 或 localhost。
