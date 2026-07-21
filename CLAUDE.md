# CLAUDE.md

本文件为 Claude Code 提供项目级最小工作指引。详细参考见 `.context/INDEX.md` 与 `.context/entries/reference/`。

## 项目概览
AI English Tutor — 基于 AI 的英语口语陪练 SPA（Vue 3 + Fastify + SQLite + 角色渲染）。

## 包管理器与 Workspace
- 包管理器：pnpm 10.7.1（仅 pnpm）
- `apps/tutor-app` — Vue 3 SPA（Vite + Pinia + UnoCSS）
- `apps/tutor-server` — Fastify + better-sqlite3 后端（ESM、tsx 直跑 TS）
- `packages/shared`（`@ai-english-tutor/shared`）— 前后端共享类型与数据
- `gateway/` — Nginx 反代（生产 Docker，开发可选）

## 最常用命令
```bash
# 开发
pnpm local            # 后端(:3000) + 前端(:6173)，日常默认
pnpm server           # 仅后端（tsx watch，读仓库根 .env）
pnpm dev              # 仅前端
pnpm dev:clean        # 杀掉 3000/6173 端口残留

# 构建
pnpm build
pnpm --filter @ai-english-tutor/server build

# 部署
pnpm push:server      # 远端部署：rsync → docker compose up

# 测试
pnpm --filter tutor-app test
pnpm --filter @ai-english-tutor/server test
pnpm --filter @ai-english-tutor/server test:unit
pnpm --filter @ai-english-tutor/server test:integration
```

## ESM + `.js` 后缀
后端与 shared 包均为 ESM，import 必须带 `.js`：

```ts
import { config } from './config.js'   // ✅
import { config } from './config'      // ❌ 运行时找不到模块
```

## Provider 模式
新增后端 Provider（LLM / TTS / ASR / 角色）时：

1. 在对应 `ai/providers/` 或 `voice/providers/` 实现；LLM 优先继承 `ai/providers/openai-base.ts`。
2. 在工厂（`ai/llm/factory.ts`、`voice/tts.ts`、`voice/asr.ts`）注册。
3. 在 `.env.example` 补充 env 文档。

详细 Provider 规范见 `.context/entries/reference/`。

## 检索更多上下文
任务开始前查询 `.context/INDEX.md`，按 `tags` / `files` / `title` 关键字定位条目。架构、配置、测试、端口、新增场景 / Live2D 模型等详细指南位于 `.context/entries/reference/`。
