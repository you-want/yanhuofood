# AI 菜单生成后续优化规划

本文档记录 [AI 菜单生成机制说明](../architecture/ai-menu-generation.md) 当前机制之后的后续优化方案。目标是让下次继续开发时，可以按阶段推进，而不是重新梳理上下文。

## 当前基线

截至本次优化，AI 菜单生成已经具备：

- 内部代码优先使用 `startDate` / `start_date`，返回和保存继续兼容 `week_start`。
- Prompt 已拆到 `lib/ai/menu-prompts.ts`。
- AI 输出 JSON 解析或 Zod 校验失败时，会自动修复重试一次。
- 生成结果返回 `generation` 元数据，服务端输出结构化日志。
- 同步生成接口 `/api/menus/generate` 仍保留，前端调用方式未变。
- 菜单记录类型、本地历史、保存接口、生成缓存查询已按 `start_date` 优先收口，并保留 `week_start` 降级。
- Supabase schema 和 migration 已补充 `start_date`、`end_date`、`period_type`、`schema_version`、`source`、`preferences_snapshot`。
- 菜单 JSON 提取、Zod 校验、错误分类、日期/餐次数检查已拆到 `lib/ai/menu-validation.ts`。
- 已支持 `date_mismatch`、`meal_count_mismatch` 错误类型，并对起止日期、星期、多余天数、多余餐次做本地归一化修复。
- 已新增 `menu_generation_logs` 表、migration 和 `lib/ai/menu-generation-log.ts`，生成接口会记录缓存命中、成功、修复成功和样例兜底日志。
- 已新增 `daily_home`、`travel`、`work_takeout`、`batch_cooking` 场景模板，菜单页可选择本次生成场景。

## 总体目标

后续优化围绕 5 个方向推进：

1. 完成 `week_start` 到 `start_date` 的渐进迁移。
2. 提升 AI 生成失败时的修复质量，而不是只做通用修复。
3. 支持多场景 Prompt 模板，例如旅游菜单、上班外卖菜单、家庭备菜菜单。
4. 让 token、耗时、错误类型可以被长期追踪。
5. 将长耗时生成从同步请求演进为异步任务。

## 阶段一：日期字段迁移收口

状态：已完成。

目标：让业务语义以 `start_date` 为主，`week_start` 只作为历史兼容字段存在。

建议改动：

- 在 `MenuRecord` 类型中补充 `start_date`、`end_date`、`period_type`、`schema_version`、`source`、`preferences_snapshot` 等字段。
- 前端历史菜单选择优先使用 `getMenuStartDate(menu.data)` 或 record 的 `start_date`。
- `lib/local-menus.ts` 内部排序和去重优先用 `start_date`，没有时回退 `week_start`。
- `/api/menus/generate` 查询缓存时优先按 `start_date` 查询；失败或字段不存在时继续按 `week_start` 回退。
- `/api/menus/save` 保存时也同步写入 `start_date`。
- Supabase migration 增加或确认以下字段：

```sql
alter table menus add column if not exists start_date date;
alter table menus add column if not exists end_date date;
alter table menus add column if not exists period_type text default 'week';
alter table menus add column if not exists schema_version integer default 2;
alter table menus add column if not exists preferences_snapshot jsonb;

create index if not exists menus_client_start_date_idx
  on menus (client_id, start_date desc);
```

兼容策略：

- 不删除 `week_start`。
- 写入时同时写 `start_date` 和 `week_start`。
- 读取时优先 `start_date`，缺失时使用 `week_start`。
- 等历史数据迁移和前端稳定后，再考虑弱化 `week_start` 的命名暴露。

验收标准：

- 旧菜单仍能展示、编辑、保存、生成食材清单。
- 新菜单响应体、菜单对象、数据库记录都包含 `start_date`。
- `pnpm lint`、`pnpm build` 通过。

## 阶段二：错误分类与针对性修复

状态：已完成第一版。已完成校验拆分、错误分类扩展、日期/餐次数检查、本地归一化修复和 warning 区分；坏 JSON 样例可在后续补自动化测试脚本。

目标：让 AI 修复不只是“再试一次”，而是根据失败原因采取更明确的修复策略。

建议新增：

- `lib/ai/menu-validation.ts`
  - `parseMenuJson(text)`
  - `validateGeneratedMenu(text, options)`
  - `classifyMenuGenerationError(error, rawText)`
- 错误类型：
  - `no_json`：响应里没有 JSON 对象。
  - `json_parse_error`：JSON 语法错误。
  - `schema_error`：Zod 校验失败。
  - `date_mismatch`：日期不连续或星期不匹配。
  - `meal_count_mismatch`：餐次数不足。
  - `truncated_output`：疑似输出被截断。
- `buildMenuRepairPrompt()` 根据错误类型生成不同修复要求。

可选增强：

- 对明显可程序修复的问题优先本地修复，例如：
  - 补齐 `start_date` / `week_start`。
  - 补齐 `end_date`。
  - 修正 `date` / `day`。
  - 截断多余天数或餐次数。
- 只有本地无法修复时才再次调用模型，减少 token 成本。

验收标准：

- 日志中能看到明确的 `errorType`。
- 修复 warning 能区分“模型格式修复”和“本地归一化修复”。
- 构造 3 到 5 个典型坏 JSON 样例，能在本地验证分类和修复。

## 阶段三：Prompt 场景模板化

状态：已完成第一版。已新增 `lib/ai/menu-prompt-scenarios.ts`，生成请求支持 `scenario`，菜单页提供场景选择控件；默认 `daily_home` 不影响原有体验。

目标：让当前日常菜单生成扩展为多个真实生活场景，而不是在一个 Prompt 里不断堆条件。

建议结构：

```ts
type MenuScenario = "daily_home" | "travel" | "work_takeout" | "batch_cooking";
```

建议文件：

- `lib/ai/menu-prompts.ts` 保留统一入口。
- `lib/ai/menu-prompt-scenarios.ts` 管理场景差异。
- `lib/schemas/menu.ts` 的请求 schema 增加可选 `scenario`。
- `app/menus/page.tsx` 增加场景选择控件。

首批场景：

- `daily_home`：当前默认家庭/个人日常菜单。
- `travel`：旅途中可获得、低烹饪依赖、注意补水和肠胃负担。
- `work_takeout`：外卖/食堂选择建议，减少详细食材步骤，强调选择原则。
- `batch_cooking`：周末备菜、复用食材、控制采购复杂度。

兼容策略：

- 不传 `scenario` 时默认为 `daily_home`。
- 当前菜单 schema 不必大改，先通过 Prompt 差异影响内容。
- 非家庭烹饪场景可以允许 `dishes` 中食材更简略，但仍保持结构化。

验收标准：

- 同一偏好在不同 `scenario` 下生成结果明显不同。
- 默认场景不影响当前菜单页使用。
- 文档记录每个场景的适用范围和限制。

## 阶段四：生成日志持久化

状态：已完成第一版。已完成日志表、migration、封装写入函数，并在 `/api/menus/generate` 写入缓存命中、成功、修复成功和兜底日志；日志不保存 API Key、base_url、完整 Prompt 或完整模型输出。

目标：线上排障时能知道生成慢在哪里、失败在哪里、token 用在哪里。

建议新增 Supabase 表：

```sql
create table if not exists menu_generation_logs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  start_date date,
  status text not null,
  source text,
  model text,
  provider text,
  duration_ms integer,
  attempts jsonb,
  warnings jsonb,
  error_type text,
  error_message text,
  created_at timestamptz default now()
);

create index if not exists menu_generation_logs_client_created_idx
  on menu_generation_logs (client_id, created_at desc);
```

注意事项：

- 不保存 API Key。
- 不保存完整 Prompt。
- 不保存完整模型原始输出，最多保存长度、错误类型和短错误信息。
- 浏览器本地模型配置只记录 provider 为 `browser`，不记录 base_url 或密钥。

代码建议：

- 新增 `lib/ai/menu-generation-log.ts`，封装日志结构。
- `/api/menus/generate` 在成功、修复成功、兜底失败时都写日志。
- Supabase 不可用时只打 `console.info`，不影响用户流程。

验收标准：

- Supabase 可用时每次生成都有日志记录。
- Supabase 不可用时生成不报错。
- 日志不包含密钥和完整 Prompt。

## 阶段五：异步生成任务

状态：已完成第一版。已新增 `menu_generation_jobs` 表、migration、任务封装、`POST /api/menus/generate-jobs` 和 `GET /api/menus/generate-jobs/:id`；第一版在 API 请求内创建任务并立即执行生成，前端尚未默认切换到异步轮询，真正 worker/队列仍待后续替换。

目标：避免长请求受部署平台超时限制，同时让前端展示更可靠的生成状态。

建议新增表：

```sql
create table if not exists menu_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  status text not null default 'queued',
  request jsonb not null,
  result jsonb,
  warnings jsonb,
  error_message text,
  created_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists menu_generation_jobs_client_created_idx
  on menu_generation_jobs (client_id, created_at desc);
```

建议接口：

- `POST /api/menus/generate-jobs`
  - 校验请求。
  - 创建任务。
  - 返回 `job_id`。
- `GET /api/menus/generate-jobs/:id`
  - 返回 `queued | running | succeeded | failed`。
  - 成功时返回菜单结果。
- 后台执行方式：
  - 第一阶段可以在 API 内创建任务后立即触发 `generateMenu()`，完成后更新 job。
  - 后续再替换为真正的 worker、cron、队列或部署平台 background job。

前端建议：

- 生成按钮点击后进入任务状态。
- 每 2 到 3 秒轮询任务。
- 支持用户离开页面后回来继续查看最近任务。
- 任务失败时展示错误和“使用样例菜单 / 重新生成”操作。

兼容策略：

- 保留现有 `/api/menus/generate` 同步接口。
- 前端可以先用 feature flag 或环境变量切换异步生成。
- 异步任务稳定后，再让菜单页默认走新接口。

验收标准：

- 生成任务超过 60 秒时，前端仍能保持状态，不依赖单个长 HTTP 请求。
- 刷新页面后能恢复最近任务状态。
- 任务成功后复用现有菜单保存逻辑。
- 同步接口仍可用，便于回滚。

## 推荐执行顺序

1. 已完成：阶段一，日期字段迁移收口。
2. 已完成第一版：阶段二，错误分类与针对性修复。
3. 已完成第一版：阶段四，生成日志持久化。
4. 已完成第一版：阶段三，Prompt 场景模板化。
5. 已完成第一版：阶段五，异步生成任务 API 和数据表。
6. 下一步：产品 P1，每日菜单模式和异步前端轮询二选一继续。

原因：

- 日期字段是基础数据语义，应先稳定。
- 错误分类会提升现有同步生成可靠性，也能服务后续异步任务。
- 日志持久化可以在异步任务前先提供排障能力。
- 场景模板是产品能力扩展，可以在基础稳定后推进。
- 异步任务涉及数据库、API、前端状态和部署形态，适合最后做。

## 下次开工建议

下次建议优先从产品 P1“每日菜单模式”或“异步生成任务前端轮询”继续。

异步生成任务最小可交付范围：

- 新增 `menu_generation_jobs` 表和 migration。
- 新增 `POST /api/menus/generate-jobs` 和 `GET /api/menus/generate-jobs/:id`。
- 第一版可在创建任务后立即执行 `generateMenu()` 并更新任务状态，后续再替换为真正 worker。
- 前端保留现有同步生成接口，先不强制切换。
- 跑 `pnpm lint` 和 `pnpm build`。

每日菜单模式最小可交付范围：

- 状态：进行中，已接入周期 `1 天`、首页/菜单页今日和明日入口、Prompt 一日菜单详情策略。
- 菜单周期支持 `1 天`。
- 首页和菜单页增加“生成今日菜单”“生成明日菜单”快捷入口。
- 一日菜单默认减少输出长度，并尽量补充每道菜做法和食材。
- 跑 `pnpm lint` 和 `pnpm build`。
