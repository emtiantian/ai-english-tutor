# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

AI English Tutor — 基于 AI 的英语口语陪练 SPA，支持 Live2D / Spine 角色渲染、语音交互、SSE 流式对话和场景化教学。

**包管理器**：pnpm 10.7.1（**仅** pnpm，不要用 npm/yarn 安装依赖）；workspace 布局见 `pnpm-workspace.yaml`。

**Workspace 结构**：
- `apps/tutor-app` — Vue 3 SPA（Vite + Pinia + UnoCSS）
- `apps/tutor-server` — Fastify + better-sqlite3 后端（ESM、tsx 直跑 TS）
- `packages/shared`（`@ai-english-tutor/shared`）— 前后端共享 TS 类型 / 角色人设 / 场景配置 / Provider 接口；以源码 `src/index.ts` 直接 export，**前后端都直接 import `.ts`**，不需要先 build
- `gateway/` — Nginx 反代（生产 Docker，开发可选）

## 常用命令

### 开发

```bash
pnpm local            # 后端(:3000) + 前端(:6173)，无网关 — 日常默认就用这个
pnpm dev              # 只起前端 (vite, :6173)
pnpm server           # 只起后端 (tsx watch, :3000) — dev 模式，读 <repo>/.env
pnpm gateway          # 只起网关 (:8080) — 调试 nginx 反代时单独跑
pnpm dev:clean        # 杀掉 3000/6173/8080 端口残留
```

### 构建

```bash
pnpm build            # 前端：vue-tsc 类型检查 + vite build
pnpm --filter @ai-english-tutor/server build   # 后端：tsc 编译
```

### 部署（生产启动）

```bash
pnpm push:server                     # 远端部署：rsync → 远端 docker compose up（脚本：scripts/deploy-to-server.sh）

docker compose up -d                 # 本地容器化运行（gateway:80 → frontend / backend / whisper）
                                     # 容器内 NODE_ENV=production 烧在 Dockerfile 里 → 自动 deploy 模式
```

如果实在要在裸机上手起后端 dist（不推荐，docker 才是正道）：

```bash
pnpm --filter @ai-english-tutor/server build
pnpm --filter @ai-english-tutor/server start    # = NODE_ENV=production node dist/index.js
```

部署脚本会做：git 干净度检查 → ssh 探测 → 本地测试 → 交互式 .env → 备份 → rsync → init-host-dir → whisper 模型下载 → `docker compose up` → 健康检查 3 次 → 失败回滚。

### 测试 — **前后端测试 runner 不一样，不要混用**

```bash
# 前端 (Vitest, jsdom)
pnpm --filter tutor-app test
pnpm --filter tutor-app test path/to/foo.test.ts

# 后端 — 不是 Vitest！每个 *.test.ts 是独立的 tsx 入口脚本，用 node:assert 自己写断言
pnpm --filter @ai-english-tutor/server test
# 跑单个后端测试：
npx tsx apps/tutor-server/src/routes/chat.test.ts
```

## 高层架构

### 后端：TutorEngine 编排 LLM/ASR/TTS

入口 `apps/tutor-server/src/index.ts` → `server.ts` 装配 Fastify、CORS、multipart、初始化 SQLite、加载词汇/场景 → 注册路由（`routes/{health,chat,voice,vocab,scenarios}.ts`）和 SSE handler。

核心是 `apps/tutor-server/src/ai/engine.ts` 的 `TutorEngine`：
- `LLM Provider`（`ai/llm.ts` + `ai/providers/{deepseek,openai,xiaomi}.ts`）— 通过 `LLM_PROVIDER` env 选择，统一 `LLMMessage` 接口（支持 text + audio multimodal content）
- `SessionManager`（`ai/session-manager.ts`）— 内存 + SQLite `session-store` 持久化的对话会话；带 LRU 过期与场景状态恢复
- `AudioPipeline`（`ai/audio-pipeline.ts`）— 把 TTS / ASR provider 包到一起；TTS 有 `voice/tts-cache.ts` 缓存
- `VocabTracker`（`ai/vocab-tracker.ts`）— 从 LLM 回复里抽生词、跟踪场景目标词进度
- `Prompts`（`ai/prompts/`）— level-assess / teaching / scenario 三种模板，配套各自 `parse*Response`

**对话三模式**（由 `routes/chat.ts` 的 `type` 字段分发到 engine 方法）：
1. `level.assess` — 3 轮 CEFR A1–C2 评估
2. `lesson.start` / `user.speak` — 自由对话教学
3. `scenario.start` — 场景化角色扮演（餐厅、购物、旅行…），词汇驱动进度

### SSE 推送

`apps/tutor-server/src/sse/handler.ts` 维护 `connections: Map<sessionId, FastifyReply>`。前端先 `GET /api/chat/stream` 建立长连接（`sessionId` 由前端 connectionId 决定），后续 `POST /api/chat` 立即返回 202，**真正的回复通过 SSE 推到对应连接**。所以 `/api/chat` 的 POST 不会阻塞等 LLM。

事件类型见 `sse/types.ts`：`teacher.chunk`（流式 token）、`teacher.response`（含 motion/expression）、`level.result`、`scenario.progress` 等。

### Voice：TTS / ASR

- `voice/tts.ts` 和 `voice/asr.ts` 是工厂；具体 provider 在 `voice/providers/`
- `TTS_PROVIDER`：`xiaomi`（已停用）/ `cosyvoice` / `volcengine`（火山方舟 Agent Plan 语音合成大模型，HTTP 流式合成，**纯 TTS 不带 ASR**，固定 speaker → 忽略音色，前端「语音风格」下拉仅作用于 LLM 人格、标签切「性格风格」，见 `/api/config` 的 `voiceStyleSelectable`）/ `browser`
- `ASR_PROVIDER`：`browser`（默认，浏览器 Web Speech API）/ `xiaomi`（已停用）/ `whisper` / `volcengine`
- 浏览器录音上传前会用 lamejs 转 MP3（16kHz mono 64kbps），所有 ASR provider 兼容

### 前端：状态机 + Provider 抽象

入口 `apps/tutor-app/src/main.ts` → `App.vue`。中心状态 `stores/tutor.ts`（Pinia composition API），关键 `phase` 状态机：

```
loading → ready → assessing → assess-result → scenario-select → teaching → scenario-complete
```

UI 各组件按 `phase` 条件渲染（见 `App.vue`）。

**三套 Provider 抽象**（接口在 `packages/shared/src/providers/`）：
- `CharacterProvider`（`tutor-app/src/providers/factory.ts`）— `live2d` / `spine` / `rive` / `svg` 四种实现，`createCharacterProviderSafe` 失败自动降级到 SVG。由 `VITE_CHARACTER_PROVIDER` 选择 provider 类型；当 `live2d` 时由 `VITE_LIVE2D_MODEL_ID` + localStorage `tutor.live2dModelId` 选具体模型，运行时通过右上角 `CharacterModelSwitcher` 切换（`composables/useCharacterProvider.ts` 的 `switchLive2DModel` 负责 dispose + 重建）
- `TTSProvider` — `local`（浏览器 SpeechSynthesis）/ `remote`（后端音频流），由 `VITE_TTS_SOURCE` 选择
- `AITeacherProvider` — `preset-teacher`（mock）/ `remote-teacher`（生产，走 `TutorClient` → SSE）

**音频/录音链路**：`composables/useAudioRecorder.ts` + `useAudioEncoder.ts` + `useAudioPlayback.ts` + `audio/{recorder,player}.ts` + `workers/`（lamejs MP3 worker）。iOS Safari 音频解锁依赖第一次用户手势。

**词汇本地存储**：`lib/vocab-db.ts`（IndexedDB via `idb`）+ `composables/useVocabSync.ts`（在线时与后端同步）。

### Shared 包

`packages/shared/src/`：
- `types.ts`、`character-persona.ts`、`scenarios.ts` — 前后端共用的领域类型
- `providers/{character,tts,ai-teacher,voice-input}-provider.ts` — Provider 接口定义
- `motion-registry*.ts` — Live2D 动作/表情注册表（带 motion-analyzer 根据回复文本选动作；hiyori 的 `HIYORI_MOTION_REGISTRY` 被后端 engine.ts 直接 import）
- `models/` — Live2D 模型清单系统（`types.ts` 定义 `Live2DModelManifest`；`registry/{hiyori,shizuku,mao_pro}.ts` 各模型 manifest；`list.ts` 注册到 `AVAILABLE_LIVE2D_MODELS`）。Provider 不再硬编码模型路径，统一读 manifest
- `persona-default.json`、`scenarios-default.json`、`motion-registry-default.json` — 默认数据，部署时可被 `~/.ai-english-tutor/data/{persona,scenarios}.json` 覆盖

### 配置覆盖优先级

由 `NODE_ENV` 决定走「dev」还是「deploy」分支（`apps/tutor-server/src/config.ts`）。**两个分支完全隔离，不会跨读**。两种模式都遵循「**单一 .env 文件，前后端共用**」：后端用 dotenv 读全部 key，前端 Vite 通过 `envDir` 指向同一文件，仅暴露 `VITE_*` 前缀变量到 bundle。

**Dev 模式**（`NODE_ENV !== 'production'`，`pnpm server` / `pnpm local` 默认走这条）：
- `.env` **只**读 `<repo>/.env`（仓库根，gitignored）
- 前端 Vite 也从同一文件读 `VITE_*`（`apps/tutor-app/vite.config.ts` 的 `envDir`）
- `DATA_DIR` 默认 `<repo>/.dev-data/`（已 gitignore，SQLite / TTS 缓存都写这里）
- 不读 `~/.ai-english-tutor/`，跟用户 home 完全脱钩

**Deploy 模式**（`NODE_ENV=production`，docker-compose / `pnpm start:deploy` / `node dist/index.js` 在 prod env 下）：
- `.env` 顺序：`${DATA_DIR}/.env` → `~/.ai-english-tutor/.env`（旧位置向后兼容）
- 同一份 `.env` 既被 `docker compose --env-file` 用作变量替换（前端 build args `VITE_BACKEND_URL` / `VITE_CHARACTER_PROVIDER`），又被 backend 容器 `env_file` 加载
- `DATA_DIR` 默认 `~/.ai-english-tutor/data/`（容器里被 docker-compose 覆盖为 `/app/data`）

第一个存在的 `.env` 就被加载，**不会合并**。模板见 `<repo>/.env.example`。

启动命令：
- `pnpm server` / `pnpm local` — dev 模式（tsx watch，读 `<repo>/.env`，写 `<repo>/.dev-data/`）
- `pnpm push:server` / `docker compose up -d` — deploy 模式（容器 `NODE_ENV=production` 烧在 Dockerfile 里）

## 代码规范要点

### ESM + `.js` 后缀

后端是 ESM（`"type": "module"`），import 必须带 `.js` 后缀，**即使源文件是 `.ts`**：

```ts
// ✅ 正确
import { config } from './config.js'
import { createLLMProvider } from './ai/llm.js'

// ❌ 错（运行时找不到模块）
import { config } from './config'
```

前端 Vite 不要求这个，但跨包从 `@ai-english-tutor/shared` 导入时，shared 内部的相对 import 也必须带 `.js`。

### Provider 模式

加新 LLM/TTS/ASR 后端：在 `voice/providers/` 或 `ai/providers/` 加文件 → 在对应工厂（`ai/llm.ts` / `voice/tts.ts` / `voice/asr.ts`）的 `createXxxProvider()` switch 里加 case → 在 `.env.example` 加 env 文档。

加新场景：编辑 `packages/shared/src/scenarios-default.json`（或部署后的 `~/.ai-english-tutor/data/scenarios.json` 覆盖）。

### 加新 Live2D 模型

A-D 阶段完成后，加模型已经是**纯数据工作**，不改 Provider 代码：

1. **放素材** — 把 `runtime/` 下整套文件（`*.moc3` / `*.model3.json` / `*.physics3.json` / `*.cdi3.json` / `*.pose3.json` / textures / motions / expressions）拍平拷到 `apps/tutor-app/public/models/<id>/`，并**把入口 `.model3.json` 重命名为 `<id>.model3.json`**（如 `hiyori/hiyori.model3.json`）。manifest 里不再手写路径，由 `defineLive2DModelManifest()` 按约定自动生成 `/models/<id>/<id>.model3.json`
2. **协议合规** — 如果是 Live2D Inc. 官方 sample，**必须**保留 `ReadMe.txt`（协议要求），并放一份 `LICENSE-Live2D.md` 到该目录；首次引入新协议时同步更新仓库根 `README.md` 的"第三方 Live2D 素材声明"章节
3. **写 manifest** — 新建 `packages/shared/src/models/registry/<id>.ts`，照 `hiyori.ts` / `shizuku.ts` / `mao_pro.ts` 三个样例（顺序复杂度递增）写：
   - 用 `defineLive2DModelManifest({ id: '<id>', ... })` 包裹，不需要写 `modelJsonPath`
   - `motionRegistry` — 把 8 个语义 motion ID（`wave/nod/think/...`）映射到模型自己的 motion key（`${groupName}_${index}` 格式；空字符串组的 key 是 `_0` / `_1` / ...，**坑**）
   - `expressionParamPresets` — 用模型的 cdi3.json 里能找到的参数名写 6+1 个语义表情（happy/neutral/curious/surprised/encouraging/thoughtful/sad）；**neutral 必须把所有用到的参数显式清 0**，否则切表情时会有残留漂移
   - `view.scale/offsetX/offsetY` — 各模型画幅差异大，需要手测调节，先填 1.0 跑起来再调
4. **注册** — 在 `packages/shared/src/models/list.ts` 的 `AVAILABLE_LIVE2D_MODELS` 数组里加进去；在 `models/index.ts` 加 export（若仍按原 `id` export 则不需要改 `index.ts`，新文件 export 后 list.ts import 即可）
5. **测试** — `apps/tutor-app/src/providers/__tests__/live2d-manifest.test.ts` 抄一组 case 覆盖新 manifest（motion key、neutral 清零、credit 字段）
6. **构建注意** — 大于 5MB 的贴图不会进 PWA precache（`vite.config.ts` 的 `globIgnores: ['**/models/**']` 已经排除），但会被 runtime CacheFirst 缓存，无需额外动作

跑 `pnpm --filter tutor-app test` + `pnpm --filter tutor-app build` 全绿就算完成。然后右上角 🎭 下拉就有新模型可选。

**坑提醒**：
- `.model3.json` 里 motion 在空字符串组 `""` 里时，Provider 加载后的 key 是 `_0` ~ `_N`（前缀为空串），manifest 里要这么写（见 `mao_pro.ts`）
- Cubism 2.1 风格模型用 `PARAM_*` 大写下划线参数名（见 `shizuku.ts`），Cubism 4 风格用 `Param*` 驼峰（见 `hiyori.ts` / `mao_pro.ts`），**两类不能混**
- 模型自带 `.exp3.json` 时（mao_pro 有 8 个），当前 Provider **不会自动加载**，仍走 `expressionParamPresets`；如果未来想直接用 `.exp3.json`，是 Provider 层改造，不是单加模型能解决的

### 测试约定

后端测试是**自执行的 tsx 脚本**（不是 Vitest），结构通常是：

```ts
import assert from 'node:assert'
// setup env BEFORE importing modules that read config
process.env.DB_PATH = '...'
const { createServer } = await import('./server.js')
async function main() { /* ... */ }
main().catch(err => { console.error(err); process.exit(1) })
```

注意：env 变量必须在 `await import(...)` 之前设置，否则 `config.ts` 已读过 process.env。`pnpm --filter @ai-english-tutor/server test` 是 `for f in $(find src -name '*.test.ts' | sort); do npx tsx "$f" || exit 1; done`，**任何一个失败就停**。

## 用户偏好（来自全局 / 本项目记忆）

- **提交说明用中文**，并且在对话里把提交说明输出给用户。
- **PRD 用中文**统一生成。
- **完成实质性变更后**（≥2 文件 / 架构决策 / 用户明确要求）：先问 “📋 是否记录为 `{category}`：『{title}』? (Y/N)”，确认后台跑 `~/.claude/skills/context-memory/scripts/context_manager.py record` + `link-commit`，立即回复继续，**不阻塞**用户。详细 7 步流程见 `~/.claude/skills/context-memory/SKILL.md`。
- **任务相关时**：项目根 `.context/INDEX.md` 存在，按当前任务关键字匹配条目，读取对应 entry 的 `retrieval_hints` 作为检索锚点。

## Git Hooks

`.githooks/post-commit` 自动把最近 60min 内创建、未关联 SHA 的 context entry 绑到刚生成的 commit。安装：`bash scripts/install-githooks.sh`。**显式跳过本次 commit**：message 含 `[skip-context]` 或 `[no-context]`。详见 `.githooks/README.md`（含 amend / rebase / cherry-pick 的 gotchas）。

## 端口

| 端口 | 服务 |
|------|------|
| 80 | Docker Gateway（生产） |
| 3000 | Backend (Fastify) |
| 6173 | Frontend (Vite dev) |
| 4173 | Frontend (Vite preview) |
| 8080 | dev gateway / Whisper 容器内 |
| 50000 | CosyVoice（可选） |
