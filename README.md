<p align="center">
  <img src="./public/logo.svg" width="96" height="96" alt="烟火食间 Logo" />
</p>

# 烟火食间

烟火食间是一个 AI 饮食规划应用，用来根据口味、忌口、健康目标、用餐人数和周期生成菜单、食谱、营养估算和食材清单。

## 本地开发

```bash
pnpm install

pnpm supabase:start
pnpm dev
```

默认访问：

```bash
http://localhost:3000
```

如果 3000 被占用，Next.js 会自动使用下一个可用端口。

## 环境变量

复制 `.env.example` 到 `.env.local`：

```bash
cp .env.example .env.local
```

配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini
```

如果没有配置 OpenAI Key，菜单生成会使用样例菜单兜底。

## 模型配置

项目支持两种模型配置：

- 服务器默认配置：通过 `.env.local` 或 Vercel 环境变量配置。
- 用户本浏览器配置：在偏好页配置，保存到当前浏览器 localStorage，不会写入服务器或 Supabase。

## 常用命令

```bash
pnpm lint
pnpm build
pnpm test:e2e
pnpm dev
```

普通 E2E 使用固定结构化菜单，不依赖真实模型服务。真实模型成功率、样例兜底率和耗时使用 `pnpm baseline:menus` 单独验证。

## 部署

推荐部署到 Vercel。详见 [部署说明](./docs/deployment/deployment.md)。

项目设计、产品规划、实施记录和运维说明统一收录在 [docs/](./docs/README.md)。

## 附近吃什么（MVP）

`/nearby` 页面可以在用户主动授权定位，或输入公司地址后，搜索附近真实餐饮 POI，并按距离、预算、评分、近期选择和本地反馈进行筛选与加权随机推荐。浏览器定位成功后，页面会通过高德逆地理编码显示可读的详细地址，同时展示坐标系、经纬度和定位精度，方便用户核对位置是否准确。

地图服务支持两种配置方式：

1. **用户本浏览器配置**：在 `/nearby` 页填写自己的高德 **Web 服务 Key**，保存在当前浏览器，适合个人部署或站点暂不承担地图调用费用的场景。
2. **站点服务端配置**：部署方可选在 `.env.local` 或线上环境变量中配置公共 Key，所有用户默认使用。用户本地 Key 存在时优先使用本地 Key。

服务端公共 Key 是可选配置：

```bash
AMAP_WEB_SERVICE_KEY=your_amap_webservice_key
# 可选，默认 8000ms
AMAP_REQUEST_TIMEOUT_MS=8000
# 可选，站点公共 Key 每日总调用单位上限；0 或不配置表示关闭应用侧限制
AMAP_PUBLIC_DAILY_REQUEST_LIMIT=150
AMAP_PUBLIC_QUOTA_TIME_ZONE=Asia/Shanghai
AMAP_PUBLIC_QUOTA_BUCKET=production
```

注意：

- 站点公共 `AMAP_WEB_SERVICE_KEY` 只能在服务端使用，不要改成 `NEXT_PUBLIC_*` 变量。
- 建议公共 Key 初始设置 `AMAP_PUBLIC_DAILY_REQUEST_LIMIT=150`。这里限制的是高德上游请求单位，不是按钮点击次数；一次“GPS 定位 → 详细地址 → 搜索”通常消耗 3 个单位，约等于每天 50 次完整流程。
- 公共额度只限制站点 Key。用户配置自己的本地 Key 时不占用站点额度，也不会写入公共计数器。
- 启用公共额度限制前必须应用 `supabase/migrations/20260722001000_nearby_public_amap_daily_quota.sql`。计数器只保存日期、环境 bucket 和汇总调用单位，不保存用户、地址、坐标或 Key。
- 当额度保护已开启但 Supabase 或计数 RPC 不可用时，服务端会暂停公共 Key，避免产生不可控费用，并引导用户使用自己的 Key。
- 用户 Key 保存键名为 `yanhuofood.localAmapConfig`，使用带版本号并经 Zod 校验的数据结构。
- 用户 Key 不写入 Supabase；地址解析、当前位置逆地理编码或附近搜索时只随本次请求临时发送给当前站点后端，服务端不保存。
- 当站点没有公共 Key、用户也没有配置本地 Key 时，页面会显示申请与配置说明，并阻止搜索；接口仍会返回 `MAP_PROVIDER_NOT_CONFIGURED`。
- 申请 Key 时服务平台必须选择“Web 服务”，不是“Web JS API”。
- 如果当前位置的详细地址解析失败，页面会保留浏览器 GPS 坐标继续搜索，并明确提示用户重新定位或改用公司地址。
- MVP 不提供配送范围、配送费、起送价、实时菜单、实时优惠或自动下单。
- 常用公司位置、筛选偏好、最近选择和门店反馈只保存在当前浏览器 localStorage，不写入 Supabase。
