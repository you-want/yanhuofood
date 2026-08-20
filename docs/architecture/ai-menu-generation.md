# AI 菜单生成机制说明

本文档记录当前项目中 AI 生成菜单的实现方式，覆盖前端入口、模型配置来源、服务端接口、Prompt 生成、结构校验、失败兜底和保存逻辑。

## 1. 入口页面

AI 菜单生成入口在 `app/menus/page.tsx`。

用户在“智能菜单”页面填写本次生成设置，包括：

- 偏好菜系/地域
- 饮食限制
- 忌口
- 健康目标
- 特殊人群
- 热量显示策略
- 清真口味
- 轻食/减脂
- 开始日期
- 连续 5 天或 7 天
- 每天餐次
- 用餐人数
- 每餐菜品数
- 预算倾向
- 单餐烹饪时间

点击生成后，前端优先创建可恢复的渐进式任务：

```http
POST /api/menus/generate-jobs
```

前端通过 `GET /api/menus/generate-jobs/:id` 读取阶段和部分结果。没有配置 Supabase 时降级为 `POST /api/menus/generate` 同步生成。请求体中会包含本次生成参数；如果当前浏览器启用了本地模型配置，还会带上 `model_config`。

渐进式任务不会直接展示模型的半截 JSON，而是按业务块更新：

1. 前端立即渲染日期和餐次骨架。
2. `menu-progressive-generator.ts` 先生成整段菜单提纲，只包含菜名、餐次和简要热量。
3. 后端最多并发生成两天的结构化详情，并严格按日期顺序写入部分菜单。
4. 每一天通过 `daySchema` 校验后才会展示；单天失败会保留提纲并继续后续日期。
5. 所有日期处理完成后再保存完整菜单并将任务标记为 `succeeded`。

## 2. 模型配置来源

当前支持两类模型配置。

### 2.1 服务器默认模型

部署时通过环境变量配置，适合给所有用户提供默认 AI 能力：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini
OPENAI_REQUEST_TIMEOUT_MS=180000
```

说明：

- `OPENAI_API_KEY`：服务端默认模型密钥，必须配置后服务器默认模型才可用。
- `OPENAI_BASE_URL`：可选。OpenAI 兼容接口需要填写，例如阿里云百炼 compatible-mode `/v1` 地址。
- `OPENAI_MODEL`：可选。未配置时默认使用 `gpt-4o-mini`。
- `OPENAI_REQUEST_TIMEOUT_MS`：可选。AI 生成超时时间，默认 `180000` 毫秒。

这些变量只在服务端读取，不会暴露给浏览器。

### 2.2 当前浏览器模型配置

模型设置页 `app/model-settings/page.tsx` 支持用户在浏览器里配置自己的模型。

配置保存在当前浏览器 `localStorage`：

```text
yanhuofood.localModelConfig
```

本地配置字段：

```ts
{
  enabled: boolean;
  provider: "openai" | "openai_compatible";
  api_key?: string;
  base_url?: string;
  model: string;
}
```

生效规则：

1. 如果当前浏览器配置已启用，并且保存了 API Key，生成菜单时优先使用浏览器本地配置。
2. 否则使用服务器环境变量中的默认模型。
3. 如果两边都没有可用 API Key，则不会调用 AI，会使用样例菜单兜底。

设置页右侧“当前生效模型”会展示当前到底是服务器环境变量生效，还是本浏览器配置生效。

## 3. 生成接口流程

服务端接口位于 `app/api/menus/generate/route.ts`。

### 3.1 请求校验

请求体使用 `generateMenuRequestSchema` 校验，定义在 `lib/schemas/menu.ts`。

主要字段：

```ts
{
  start_date?: string;
  mealCount?: number;
  days?: 5 | 7;
  dishes_per_meal?: number;
  energy_display?: "auto" | "on" | "off";
  halal?: boolean;
  light_meal?: boolean;
  special_group?: "children" | "elderly" | "pregnant" | null;
  cuisines?: string;
  dietary_restrictions?: string[];
  disliked_ingredients?: string[];
  diners_count?: number;
  health_goal?: "balanced" | "fat_loss" | "high_protein" | "low_sugar" | "muscle_gain";
  budget_level?: "low" | "medium" | "high";
  cooking_time_limit?: number;
  model_config?: LocalModelConfig;
  force_regenerate?: boolean;
}
```

### 3.2 确定规划日期

如果请求传了 `start_date`，它会作为菜单的开始日期和 `week_start`。

如果没有传，则使用当前自然周周一：

```ts
const startDate = parsedBody.data.start_date || weekStart();
```

业务内部新代码优先使用 `startDate` / `start_date` 命名，返回和保存时仍同步保留 `week_start`，用于兼容现有前端、Supabase 查询和历史本地菜单。

### 3.3 读取历史偏好

接口会尝试读取历史偏好：

1. 优先从 Supabase `preferences` 表读取。
2. 如果没有 Supabase，则尝试从 Cookie 里的 `prefs` 读取。
3. 最后用本次请求参数覆盖历史偏好。

最终生成使用：

```ts
const finalPrefs = { ...(storedPrefs || {}), ...requestPrefs };
```

目前“智能菜单”页面已经把主要生成参数放在页面里，用户可以每次临时调整。

### 3.4 缓存逻辑

如果配置了 Supabase，并且请求没有 `force_regenerate`，接口会尝试按 `client_id + week_start` 读取已生成菜单。

当前前端生成时会传：

```ts
force_regenerate: true
```

所以点击“重新生成计划”会绕过缓存，直接重新生成。

## 4. Prompt 生成

Prompt 模板集中在 `lib/ai/menu-prompts.ts`，模型调用和结果处理在 `lib/ai/menu-generator.ts`。

`buildMenuGenerationPrompt()` 会根据用户设置组装中文 Prompt。当前要求模型：

- 生成指定开始日期到结束日期的连续 5 天或 7 天菜单。
- 顶层必须输出 `start_date`，并同步输出兼容字段 `week_start`，两者值相同。
- 每天必须带 `date` 字段。
- `day` 必须是真实星期英文缩写：`Mon`、`Tue`、`Wed`、`Thu`、`Fri`、`Sat`、`Sun`。
- 每天生成指定餐次数。
- 每餐生成指定菜品数。
- 多菜品场景下，`name` 里用顿号列出多个菜名。
- 为了控制输出长度，`dishes` 数组只输出代表菜的结构化食材。
- 每道菜最多 3 个食材、最多 2 个调料。
- 做法最多 1 条，且不超过 25 个中文字。
- 只输出 JSON，不输出 Markdown 或解释文字。

Prompt 中会要求返回类似结构：

```json
{
  "start_date": "2026-07-13",
  "week_start": "2026-07-13",
  "period_type": "week",
  "end_date": "2026-07-19",
  "schema_version": 2,
  "days": [
    {
      "date": "2026-07-13",
      "day": "Mon",
      "meals": [
        {
          "type": "breakfast",
          "title": "餐食标题",
          "name": "菜名1、菜名2",
          "calories": 350,
          "nutrition": {
            "calories": 350,
            "protein_g": 20,
            "fat_g": 10,
            "carbs_g": 40,
            "fiber_g": 5
          },
          "dishes": [
            {
              "name": "菜名",
              "ingredients": [
                {
                  "name": "食材",
                  "amount": 100,
                  "unit": "g",
                  "category": "vegetable"
                }
              ],
              "seasonings": [
                {
                  "name": "盐",
                  "unit": "适量",
                  "category": "seasoning"
                }
              ],
              "steps": ["一句话简短做法"],
              "calories": 200,
              "cooking_time_minutes": 20,
              "difficulty": "easy",
              "tags": ["家常"]
            }
          ]
        }
      ]
    }
  ]
}
```

## 5. 模型调用参数

模型调用使用 OpenAI SDK，兼容 OpenAI 标准接口和 OpenAI-compatible 接口。

当前参数：

```ts
temperature: 0.4
max_tokens: daysCount === 7 ? 9000 : 6500
timeout: OPENAI_REQUEST_TIMEOUT_MS || 180000
```

API Key 选择逻辑：

```ts
clientApiKey || process.env.OPENAI_API_KEY
```

模型名选择逻辑：

```ts
localModelConfig.model || process.env.OPENAI_MODEL || "gpt-4o-mini"
```

Base URL 选择逻辑：

```ts
localModelConfig.base_url || process.env.OPENAI_BASE_URL
```

## 6. 返回解析和结构校验

模型返回后会先提取 JSON 对象：

```ts
parseJsonObject(text)
```

然后用 `menuSchema` 校验：

```ts
const validated = menuSchema.parse(parsed);
```

`menuSchema` 现在接受以下两类顶层日期结构：

- 新结构：包含 `start_date`。
- 旧结构：只包含 `week_start`。

只要两者至少存在一个，后续 `normalizeMenu()` 和 `applyOptions()` 会统一补齐 `start_date`、`week_start`、`end_date`。

`menuSchema` 还会对一些模型常见输出做兼容：

- 中文餐次会归一为 `breakfast`、`lunch`、`dinner`、`snack`。
- 中文食材分类会映射为英文枚举。
- `适量`、`少许` 这类数量会转成 `undefined`。
- 难度中文会归一为 `easy`、`medium`、`hard`。

校验通过后，还会调用：

```ts
applyOptions(normalizeMenu(validated), options)
```

它会确保：

- 菜单开始日期等于用户选择的 `start_date`。
- 自动计算 `end_date`。
- 每天补齐真实 `date` 和 `day`。
- 天数符合 5 天或 7 天。
- 餐次数符合用户选择。
- 多菜品场景下补齐菜名展示。

## 7. 失败兜底

如果没有 API Key、模型超时、模型返回格式不合法或调用失败，系统不会直接报错中断，而是返回样例菜单。

如果首次模型输出无法解析 JSON 或无法通过 Zod 校验，系统会自动进行一次修复重试：

1. 记录首次输出的解析/校验错误。
2. 使用 `buildMenuRepairPrompt()` 要求模型只修复 JSON。
3. 修复结果再次走 `parseJsonObject()`、`menuSchema.parse()` 和 `applyOptions()`。
4. 修复成功时仍返回 `source: "ai"`，并带 warning：`AI 首次输出格式不完整，已自动修复后使用。`
5. 修复仍失败时才进入样例菜单兜底。

兜底菜单来自 `SAMPLE_MENU`。

返回来源：

```ts
source: "sample"
```

同时返回 warning：

```text
模型 API Key 未配置，已使用样例菜单。
AI 生成失败，已使用样例菜单。
AI 生成超时，已使用样例菜单。建议减少天数、餐次或每餐菜品数后重试。
AI 首次输出格式不完整，已自动修复后使用。
```

这保证了页面始终能展示一份菜单，用户不会卡在空状态。

## 8. 菜单保存

如果配置了 Supabase，生成成功后接口会 upsert 到 `menus` 表。

保存字段包括：

- `client_id`
- `week_start`
- `data`
- `source`
- `schema_version`
- `start_date`
- `end_date`
- `period_type`
- `preferences_snapshot`

如果 Supabase 没配置，前端会把生成的菜单保存到当前浏览器 localStorage，作为本地历史菜单。

## 9. 热量显示逻辑

热量显示不是由模型配置决定，而是由本次生成设置决定。

当前规则：

```ts
energy_display === "on"
||
(
  energy_display === "auto"
  && (light_meal || health_goal !== "balanced")
)
```

含义：

- `始终显示`：菜单表格和营养概览都显示热量。
- `隐藏`：前端隐藏热量展示。
- `按目标显示`：减脂、高蛋白、控糖、增肌、轻食/减脂场景显示；均衡饮食默认隐藏。

## 10. 模型连接测试

设置页的“测试连接”请求：

```http
POST /api/model/test
```

它只测试当前表单中的本浏览器模型配置，不会保存配置。

测试方式：

- 使用用户填写的 API Key、Base URL、Model。
- 向模型发送一句短 prompt：`请只回复 ok，用于测试模型连接。`
- 超时时间为 30 秒。
- 返回是否成功、模型名、延迟和短样例。

设置页还会请求：

```http
GET /api/model/test
```

用于读取服务器环境变量状态，只返回：

- 是否配置 `OPENAI_API_KEY`
- 默认模型名
- 是否配置 Base URL
- 推断的服务类型

不会返回 API Key。

## 11. 当前实现特点

- 支持部署环境变量默认模型。
- 支持每个浏览器用户自己配置模型，不互相影响。
- 支持任意开始日期的连续 5 天或 7 天规划。
- 支持 AI 输出格式失败后自动修复一次，再失败才使用样例菜单兜底。
- 支持 Supabase 服务端历史保存，也支持无 Supabase 时的浏览器本地历史。
- Prompt 输出被严格限制，以减少超时和 JSON 过长风险。
- 支持整周提纲先展示、按天补充详情，并在刷新后恢复已完成进度。
- Prompt 已集中到 `lib/ai/menu-prompts.ts`，方便后续增加旅游菜单、上班外卖菜单等场景模板。
- API 返回 `generation` 元数据，并在服务端输出结构化日志，方便排查耗时、token 和修复情况。

## 12. 后续可优化方向

详细执行规划见 [AI 菜单生成后续优化规划](../plans/ai-menu-generation-roadmap.md)。

- 数据库和本地历史仍以 `week_start` 作为兼容查询键。后续可在 Supabase schema 和前端历史选择逻辑稳定后，逐步迁移为 `start_date` 主键语义。
- 当前重试只做一次 JSON 修复。后续可按错误类型区分：截断、枚举错误、字段缺失、日期不连续，并使用不同修复模板。
- Prompt 已完成模板化拆分。后续可扩展 `travel`、`work_takeout`、`family_batch_cooking` 等场景模板。
- 当前已记录每次尝试的耗时、输出长度和 OpenAI usage token。后续可写入服务端日志平台或数据库审计表。
- 渐进式任务当前由 Next.js `after()` 启动，并通过任务表保存部分结果。后续可将服务器默认模型任务迁移到独立 worker；浏览器模型配置仍需由浏览器在任务失效后重新携带，不能把 API Key 写入 Supabase。
