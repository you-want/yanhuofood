# 项目文档

本目录集中保存烟火食间的产品、架构、实施计划和部署运维文档。

仓库根目录只保留两份有特殊用途的 Markdown 文件：

- [`README.md`](../README.md)：项目入口、快速开始和核心配置概览。
- [`AGENTS.md`](../AGENTS.md)：代码代理在本仓库中的开发约束，必须位于仓库根目录。

## 架构与实现

- [AI 菜单生成机制说明](./architecture/ai-menu-generation.md)：菜单生成入口、模型配置、Prompt、结构校验、失败兜底和保存流程。

## 产品方案

- [可执行产品规划](./product/product-execution-plan.md)：家庭饮食规划主线、指标、阶段任务和准入条件。
- [“今天这顿吃什么”功能规划](./product/today-meal-recommendation-plan.md)：即时推荐功能的范围、交互和验收标准。
- [“附近吃什么”产品与技术方案](./product/nearby-food-product-plan.md)：地图 POI、筛选推荐、隐私边界和分阶段方案。

## 实施计划与开发记录

- [AI 菜单生成后续优化规划](./plans/ai-menu-generation-roadmap.md)：菜单生成能力的阶段状态和后续工作。
- [菜单 AI 生成稳定性与准确性改造计划](./plans/menu-ai-reliability-plan.md)：输入契约、输出准确性、恢复策略和实施结果。
- [“附近吃什么”实现清单](./plans/nearby-food-implementation-checklist.md)：附近餐饮 MVP 的实现与验收记录。
- [可信菜谱增强实现方案与开发记录](./plans/recipe-knowledge-implementation-plan.md)：菜谱知识库、grounding 和上下文问答方案。

## 博客与对外介绍

- [烟火食间产品介绍博客](./blog/yanhuofood-introduction.md)：以口语化方式介绍产品初衷、核心功能、适用场景和后续方向，可用于博客或社区发布。

## 部署与运维

- [部署说明](./deployment/deployment.md)：Vercel、环境变量、域名、Supabase 和高德配置。
- [账户、微信登录与公众号授权](./deployment/account-wechat-access.md)：账户权限、关注状态和公共资源授权边界。
- [微信公众号验证码与可选扫码登录](./deployment/wechat-code-login.md)：当前微信登录方案、迁移、环境变量和上线检查。

## 维护规则

- 新增长期有效的文档时，放入对应子目录并更新本索引。
- 已被新方案替代且不再提供维护价值的草稿、临时讨论和旧实施计划直接删除，不在仓库中保留重复副本。
- 文档中引用仓库文件时使用相对链接，移动文件后同步修复链接。
- 数据库变更以 `supabase/migrations/` 为准；文档只说明迁移顺序和运维要求，不替代版本化 migration。
