# CLAUDE.md

本文件为 Claude Code 提供项目级工作指引。

## 项目概览

AI English Tutor — 基于 AI 的英语口语陪练 SPA，支持 Live2D / Spine / Rive 角色渲染、语音交互、SSE 流式对话和场景化教学。

- **包管理器**：pnpm 10.7.1（仅 pnpm）
- **Workspace**：见 `pnpm-workspace.yaml`
  - `apps/tutor-app` — Vue 3 SPA（Vite + Pinia + UnoCSS）
  - `apps/tutor-server` — Fastify + better-sqlite3 后端（ESM、tsx 直跑 TS）
  - `packages/shared`（`@ai-english-tutor/shared`）— 前后端共享类型与数据
  - `gateway/` — Nginx 反代（生产 Docker，开发可选）

## 常用命令

```bash
# 开发
pnpm local            # 后端(:3000) + 前端(:6173)，无网关 — 日常默认
pnpm server           # 仅后端（tsx watch，读 <repo>/.env）
pnpm dev              # 仅前端
pnpm dev:clean        # 杀掉 3000/6173/8080 端口残留

# 构建
pnpm build                                    # 前端：vue-tsc + vite build
pnpm --filter @ai-english-tutor/server build  # 后端：tsc 编译

# 部署
pnpm push:server      # 远端部署：rsync → docker compose up

# 测试
pnpm --filter tutor-app test
pnpm --filter @ai-english-tutor/server test
pnpm --filter @ai-english-tutor/server test:unit
pnpm --filter @ai-english-tutor/server test:integration
```

## 架构速览

### 后端

入口 `src/index.ts` → `server.ts` 装配 Fastify、CORS、multipart、SQLite、词汇/场景加载 → 注册路由与 SSE handler。

核心模块：

| 模块 | 说明 |
|------|------|
| `ai/engine.ts` | 请求入口，按 `type` 分发到具体引擎 |
| `ai/engines/{free-form,scenario,vocab}-engine.ts` | 自由对话 / 场景角色扮演 / 生词讲解 |
| `ai/llm.ts` / `ai/llm/factory.ts` / `ai/providers/*.ts` | LLM Provider（`LLM_PROVIDER` 选择 deepseek / volcengine / xiaomi / mock） |
| `ai/session-manager.ts` | 内存 + SQLite 会话，LRU 过期与场景恢复 |
| `ai/audio-pipeline.ts` / `ai/audio/*.ts` | TTS / ASR 编排与音频广播 |
| `ai/vocab-tracker.ts` / `ai/scenario-vocab-picker.ts` | 生词跟踪、场景目标词进度 |
| `ai/prompts/` | 提示词模板（`free-form/`、`scenario/`、`vocab/`） |
| `ai/parsers/` | 回复解析 |
| `ai/response/response-orchestrator.ts` | SSE 事件编排 |
| `db/{schema,repositories,migrations}/` | 表结构、仓库、迁移 |
| `voice/{tts,asr}.ts` / `voice/providers/*.ts` | 语音合成与识别工厂及具体实现 |

路由：`src/routes/{health,chat,voice,vocab,scenarios,config}.ts`。

### SSE 推送

`src/sse/handler.ts` 维护 `connections: Map<sessionId, FastifyReply>`。前端先 `GET /api/chat/stream` 建立长连接，后续 `POST /api/chat` 立即返回 202，**真正的回复通过 SSE 推送**。事件类型见 `sse/types.ts`。

### Voice

- **TTS**：`TTS_PROVIDER` 可选 `browser` / `volcengine` / `cosyvoice` / `xiaomi`
- **ASR**：`ASR_PROVIDER` 可选 `browser`（默认）/ `volcengine` / `whisper` / `xiaomi`
- 浏览器录音上传前用 lamejs 转 MP3（16kHz mono 64kbps）
- TTS 缓存：`voice/tts-cache.ts`

### 前端

入口 `src/main.ts` → `App.vue`。中心状态 `stores/tutor.ts`，`phase` 状态机驱动各组件渲染。

Provider 抽象：

- **角色**：`providers/{live2d,spine,rive,svg}-character.ts`，由 `VITE_CHARACTER_PROVIDER` 选择；Live2D 模型通过 `packages/shared/src/models/` 的 manifest 管理
- **TTS**：`speech-synthesis-tts.ts`（本地）/ `remote-teacher.ts`（远端），由 `VITE_TTS_SOURCE` 选择
- **AI 教师**：`preset-teacher.ts`（mock）/ `remote-teacher.ts`（生产，走 `TutorClient` → SSE）

## Shared 包

`packages/shared/src/`：

- `types.ts`、`scenarios.ts`、`character-persona.ts` — 前后端共用领域类型
- `providers/*.ts` — Provider 接口定义
- `models/` — Live2D 模型清单系统（`define-manifest.ts`、`registry/`、`list.ts`）
- `motion-registry.ts`、`motion-analyzer.ts` — 动作/表情注册与分析
- `persona-default.json`、`scenarios-default.json` — 默认数据，部署后可被 `~/.ai-english-tutor/data/` 覆盖

Shared 包以 `src/index.ts` 直接 export，前后端都直接 import `.ts`，不需要先 build。

## 配置

- 单一 `.env` 前后端共用；dev 读仓库根 `.env`，deploy 读 `~/.ai-english-tutor/data/.env`
- `NODE_ENV !== 'production'` 为 dev 模式：`DATA_DIR` 默认 `<repo>/.dev-data/`
- `NODE_ENV=production` 为 deploy 模式：`DATA_DIR` 默认 `~/.ai-english-tutor/data/`（容器内被覆盖为 `/app/data`）
- 模板见 `.env.example`

## 代码规范

### ESM + `.js` 后缀

后端是 ESM，import 必须带 `.js` 后缀，即使源文件是 `.ts`：

```ts
// ✅ 正确
import { config } from './config.js'

// ❌ 错（运行时找不到模块）
import { config } from './config'
```

Shared 包内部相对 import 同样要带 `.js`。

### Provider 模式

新增后端 Provider：

1. 在 `ai/providers/` 或 `voice/providers/` 新增实现文件
2. 在 `ai/llm/factory.ts`、`voice/tts.ts`、`voice/asr.ts` 的工厂 switch 中注册
3. 在 `.env.example` 补充 env 文档

### 新增场景

编辑 `packages/shared/src/scenarios-default.json`（或部署后用 `~/.ai-english-tutor/data/scenarios.json` 覆盖）。

### 新增 Live2D 模型

已是纯数据工作，参考 `packages/shared/src/models/registry/{hiyori,shizuku,mao_pro}.ts`：

1. 素材放 `apps/tutor-app/public/models/<id>/`，入口 `.model3.json` 重命名为 `<id>.model3.json`
2. 官方 sample 需保留 `ReadMe.txt`，并放 `LICENSE-Live2D.md`
3. 新建 `packages/shared/src/models/registry/<id>.ts`，用 `defineLive2DModelManifest()` 定义 motion / expression / view
4. 在 `packages/shared/src/models/list.ts` 注册
5. 在 `apps/tutor-app/src/providers/__tests__/live2d-manifest.test.ts` 加测试

**常见坑**：
- 空字符串 motion 组的 key 是 `_0` / `_1`
- Cubism 2.1 参数名形如 `PARAM_*`，Cubism 4 形如 `Param*`，不能混用
- `neutral` 表情必须显式清零所有用到的参数，否则切表情时会残留漂移

## 测试约定

后端测试统一放在 `apps/tutor-server/tests/`，按 `unit/` 和 `integration/` 分层，共享 helper 在 `tests/helpers/`。

- 测试代码通过 `@/` 引用 `src/` 下的生产模块，例如 `import { createServer } from '@/server.js'`
- 测试 helper 通过 `@tests/helpers/` 引用，例如 `import { createTestEnv } from '@tests/helpers/env.js'`
- helper 顶部只能 `import 'node:*'`，禁止静态 import 任何 `src/` 生产模块
- 依赖 `process.env` 的模块在 `beforeAll` / `it` 中动态导入，且晚于 `env.setup()`
- 修改 `config` 后要在 `afterEach` / `afterAll` 恢复原始值
- Vitest 使用 `pool: 'forks'`，测试文件独立进程，避免全局单例污染

前端测试与源码放在同一目录，使用 Vitest + jsdom。

## 端口

| 端口 | 服务 |
|------|------|
| 80 | Docker Gateway（生产） |
| 3000 | Backend（Fastify） |
| 6173 | Frontend（Vite dev） |
| 4173 | Frontend（Vite preview） |
| 8080 | dev gateway / Whisper 容器内 |
| 50000 | CosyVoice（可选） |
