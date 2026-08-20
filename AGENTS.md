# AGENTS.md

## 项目概览

烟火食间是一个基于 Next.js 的 AI 饮食规划应用，核心目标是帮助用户根据口味、忌口、健康目标、用餐人数和真实生活场景生成菜单、食谱、营养估算和食材清单。

## 技术栈

- Next.js App Router
- TypeScript
- React
- TailwindCSS
- Supabase
- OpenAI SDK
- React Query
- Framer Motion
- Radix UI primitives
- lucide-react
- Zod

## 常用命令

```bash
pnpm dev
pnpm lint
pnpm build
```

## 代码结构约定

- `app/`：页面和 API route。
- `components/`：业务组件。
- `components/ui/`：基础 UI 组件，保持轻量、可复用。
- `lib/ai/`：AI 生成逻辑、prompt、模型调用。
- `lib/domain/`：菜单、营养、食材等业务逻辑。
- `lib/schemas/`：Zod schema。
- `lib/types/`：共享 TypeScript 类型。

## 开发原则

- 保持 Next.js 模块化单体，不要过早拆微服务。
- AI 输出必须结构化，并使用 Zod 校验。
- 旧菜单结构必须继续兼容，避免历史数据无法展示。
- Supabase schema 新字段上线前，API 应保留降级写入。
- 用户浏览器模型配置只能保存在 localStorage，不得写入 Supabase。
- service role key 只能在服务端使用，不能传到客户端。
- UI 优先服务工具效率，避免做成营销页。
- 宽屏优先使用 `max-w-[1600px]`，菜单页主表格区域优先占用横向空间。

## 数据库迁移与自动部署

- 所有 Supabase schema、函数、策略和数据修复变更都应优先写成版本化 migration，放在 `supabase/migrations/`，不要只提供需要用户在 Supabase Dashboard 手动执行的 SQL。
- 仓库的 `.github/workflows/supabase-migration.yml` 会在代码 push/合并到 `main` 后自动执行 `supabase db push --dry-run` 和 `supabase db push`，将尚未应用的 migration 部署到绑定的 Supabase 项目。
- 只要问题能够通过 migration 和现有 CI 自动部署解决，就应直接创建/修改 migration，并告知用户合并到 `main` 后由 CI 自动应用；不要要求用户手动更新数据库。
- 不要把密钥写入 migration 或仓库。`SUPABASE_ACCESS_TOKEN` 等部署凭据由 GitHub Actions Secrets 管理。
- 完成数据库相关改动后，应检查 migration 文件、CI workflow 和应用代码是否匹配；能本地验证的内容先本地验证。
- 只有在无法通过 migration 自动化的外部平台配置、CI 凭据缺失/失效、生产迁移失败，或必须由用户确认的高风险数据操作时，才要求用户手动处理，并明确说明原因、位置和步骤。
- 除非用户明确要求，不要绕过 CI 直接对生产数据库执行 `supabase db push` 或手工 SQL。

## 本地模型配置机制

偏好页的“本浏览器模型配置”使用 `localStorage` 保存：

- key: `yanhuofood.localModelConfig`
- 工具函数：`lib/local-model-config.ts`
- 生成菜单时由 `app/menus/page.tsx` 临时随请求发送到 `/api/menus/generate`
- 后端只用于本次 AI 调用，不保存

## 验证要求

提交前至少运行：

```bash
pnpm lint
pnpm build
```

如果修改 UI，尽量在本地浏览器检查：

- 首页
- 偏好页
- 菜单页
- 食材清单页
- 食谱库页

重点检查桌面宽屏、移动端宽度、表格溢出、按钮文字换行和表单输入可读性。
