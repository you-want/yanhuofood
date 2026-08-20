# 可信菜谱增强实现方案与开发记录

> 分支：`feat/recipe-knowledge-grounding`
> 开始日期：2026-07-24
> 状态：首版开发完成

## 1. 目标

在保持 Next.js 模块化单体和 Supabase/Postgres 架构的前提下，将现有食谱库升级为可追踪来源、可结构化检索的可信菜谱知识层，并让菜单生成优先从可信候选菜谱中选择，再由服务端补全标准食材、步骤和证据信息。

本期同时提供围绕当前菜谱的上下文问答入口，但不建设通用聊天首页，不引入 Flask、Neo4j、Milvus 或独立向量服务。

## 2. 核心流程

```text
现有 recipes 表
    ↓ 扩展来源、结构化食材、步骤、时间、难度、质量状态
可信菜谱候选检索
    ↓ 硬约束过滤、偏好评分、食材复用与多样性排序
AI 菜单规划
    ↓ 优先选择 source_recipe_id，必要时允许生成新菜
服务端补全标准菜谱
    ↓
现有 Menu schema、Zod 校验、修复、保存和食材清单流程
    ↓
菜单/食谱详情中的来源说明、推荐解释和上下文问答
```

## 3. 架构原则

- 保持 Next.js App Router + Supabase 模块化单体。
- 扩展现有 `recipes` 表，不创建互不兼容的第二套食谱系统。
- 旧 `ingredients TEXT[]`、`instructions TEXT`、`calories` 字段继续兼容。
- 新字段在 API 和类型中保持可选，历史菜单无需迁移即可展示。
- 菜谱知识检索失败时，菜单生成降级到现有 AI 生成流程。
- 用户浏览器模型配置只随本次请求发送，不写入 Supabase。
- 所有数据库变更使用 `supabase/migrations/` 下的版本化 migration，通过 main 分支 CI 自动应用。
- 不保存 API Key、完整 Prompt 或完整模型输出。

## 4. 数据模型

### 4.1 `recipe_sources`

记录系统精选、开源数据、用户创建和 AI 生成等来源信息：

- `slug`
- `name`
- `source_type`
- `homepage_url`
- `license_name`
- `license_url`
- `attribution_text`
- `source_revision`

### 4.2 扩展 `recipes`

新增可选字段：

- `source_id`
- `source_recipe_id`
- `source_url`
- `servings`
- `cooking_time_minutes`
- `prep_time_minutes`
- `difficulty`
- `ingredient_details`
- `steps`
- `seasonings`
- `nutrition`
- `equipment`
- `dietary_flags`
- `health_goals`
- `meal_types`
- `schema_version`
- `content_hash`
- `quality_status`
- `imported_at`

### 4.3 `recipe_ingredients`

用于食材精确过滤、别名归一和后续替换关系：

- `recipe_id`
- `position`
- `name`
- `normalized_name`
- `amount`
- `unit`
- `category`
- `optional`
- `is_seasoning`

### 4.4 `ingredient_aliases`

维护西红柿/番茄、马铃薯/土豆等高频别名。

## 5. 菜谱候选检索

第一版不使用 embedding，按照以下顺序执行：

1. 查询公开且质量合格的食谱。
2. 根据餐次、场景、菜系、时间进行初筛。
3. 代码层排除忌口、不喜欢食材、拉黑菜品和明显冲突。
4. 根据菜系、健康目标、场景、可用食材、历史反馈、食材复用和烹饪时间评分。
5. 控制同类菜、主蛋白和菜名重复。
6. 将紧凑候选摘要传给模型。

候选分数必须带可解释原因，供菜单页面展示“为什么推荐”。

## 6. 菜单 grounding

菜单生成 Prompt 优先要求模型返回可信菜谱 ID：

```json
{
  "source_recipe_id": "system-tomato-beef-stew",
  "serving_multiplier": 1,
  "adaptation_note": "减少盐和油"
}
```

服务端根据 ID 读取标准菜谱，按人数补全并缩放食材，最终仍生成现有 `Dish` 和 `Menu` 结构。若没有合适候选，允许保留完整的 AI 生成菜品并标记 `source_kind: generated`。

## 7. 上下文问答

首版支持：

- 为什么推荐这道菜
- 替换食材
- 减少油盐
- 调整人数
- 没有某种设备怎么做
- 提前备菜
- 剩余食材利用

入口放在 `RecipeDetailDialog` 和菜单菜品详情中。回答返回结构化的答案、替代建议、警告、来源和置信度；首版不保存多轮聊天历史，也不自动修改菜单。

## 8. 开发清单

### Epic 1：菜谱知识库基础

- [x] 创建功能分支
- [x] 创建设计方案和开发记录文档
- [x] 添加 `recipe_sources` migration
- [x] 扩展 `recipes` 表
- [x] 添加 `recipe_ingredients` 表
- [x] 添加 `ingredient_aliases` 表
- [x] 添加 TypeScript 类型
- [x] 添加 Zod schema
- [x] 实现旧食谱兼容归一化
- [x] 更新食谱 API 的新旧字段双写
- [x] 添加首批系统精选菜谱数据

### Epic 2：可信候选增强菜单生成

- [x] 实现菜谱搜索
- [x] 实现硬约束过滤
- [x] 实现候选评分和解释原因
- [x] 实现候选多样性控制
- [x] 将候选摘要接入普通菜单生成
- [x] 将候选摘要接入渐进式菜单生成
- [x] 支持 `source_recipe_id` 和证据信息
- [x] 实现可信菜谱补全和人数缩放
- [x] 候选不可用时降级到现有生成流程
- [x] 增加 grounding 日志字段

### Epic 3：菜谱上下文问答

- [x] 添加问答请求和响应 schema
- [x] 实现问题类型规则分类
- [x] 实现菜谱问答上下文构建
- [x] 实现结构化 AI 回答
- [x] 添加 `/api/recipes/ask`
- [x] 在 `RecipeDetailDialog` 增加问答入口
- [x] 在菜单菜品详情增加问答入口
- [x] 添加加载、错误和移动端状态

### Epic 4：测试、解释与收尾

- [x] 添加菜谱归一化测试
- [x] 添加候选检索和排序测试
- [x] 添加菜单 grounding 测试
- [x] 添加菜谱问答 API 测试
- [x] 添加 UI E2E 测试
- [x] 更新相关产品和技术文档
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm build`
- [x] 完成桌面和移动端浏览器检查

## 9. 暂不实现

- [ ] 向量 embedding 与语义检索
- [ ] Neo4j 或 GraphRAG
- [ ] Milvus 或独立向量数据库
- [ ] 通用聊天首页
- [ ] 多会话聊天历史
- [ ] 自动抓取大规模网络菜谱
- [ ] 自动根据问答修改已保存菜单
- [ ] 用户公开分享和评分系统

以上项目属于明确延期项，未开发前保持未勾选。

## 10. 验收指标

- 历史食谱、历史菜单能够继续展示和编辑。
- 至少一批系统精选菜谱具有稳定 ID、来源、结构化食材和步骤。
- 菜单生成能返回有效的 `source_recipe_id`，且服务端可补全标准菜谱。
- 菜谱候选不包含用户忌口和明确不喜欢的食材。
- 菜谱知识层不可用时，现有菜单生成仍可工作。
- 菜谱问答明确围绕当前菜谱，并能返回来源和警告。
- `pnpm lint`、`pnpm build` 通过。

## 11. 开发记录

### 2026-07-24

- 从 `main` 创建 `feat/recipe-knowledge-grounding`。
- 建立本实现方案与持续开发记录。
- 新增可信菜谱知识层 migration：来源表、食材明细表、食材别名表、`recipes` 扩展字段、grounding 日志字段和 8 道系统精选菜谱。
- 完成旧食谱兼容归一化以及食谱 API 新旧字段降级写入；`recipe_ingredients` 使用 best-effort 双写，不阻断主食谱保存。
- 完成可信候选检索、硬约束过滤、评分解释、多样性控制、普通/渐进式菜单候选注入、服务端标准菜谱补全和按人数缩放。
- 完成菜谱上下文问答 schema、规则分类、结构化 AI 回答、规则降级、`/api/recipes/ask`、食谱详情入口和菜单菜品详情入口。
- 浏览器本地模型配置仍只读取 `yanhuofood.localModelConfig`，仅随当前生成或问答请求发送，不写入 Supabase。
- 使用临时 PostgreSQL 14 实例按文件名顺序执行全部 16 个 migration，验证通过；结果包含 1 个来源、8 道精选菜谱、41 条结构化食材和 15 个食材别名。Docker Desktop 未运行，因此未执行 `supabase db reset`，但完整 SQL migration 链已验证。
- 新增 `tests/recipe-knowledge.spec.ts` 和 `tests/recipe-question.spec.ts`；完整 Playwright 桌面端与 iPhone 12 移动端测试结果为 `154 passed, 2 skipped`。
- 全量测试发现附近地图状态接口在未授权时缺少固定的 `publicQuota` 结构，已补齐响应结构并通过相关回归测试。
- `pnpm lint` 通过。
- `pnpm build` 通过，生产构建包含 `/api/recipes/ask`。
- 合并到 `main` 后，`supabase/migrations/20260724010000_recipe_knowledge_base.sql` 将由 `.github/workflows/supabase-migration.yml` 自动 dry-run 并部署；无需手动在 Supabase Dashboard 执行 SQL。
- 未实现的 embedding、GraphRAG、Milvus、通用聊天、多会话历史、自动抓取、问答自动改菜单和公开分享评分仍保持未勾选。

## 12. 首版已知边界

- 渐进式生成的中间进度仍展示模型当时返回的菜品，最终完成结果才统一执行可信菜谱补全。
- 可信菜谱食材和调味料会按人数缩放；营养值当前保留菜谱原始估算，不做机械等比放大。
- 首版使用规则检索和精确菜名兼容匹配，不包含 embedding 或语义向量检索。
- 问答不保存多轮会话，也不会自动修改已保存菜单。
