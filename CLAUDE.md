# CLAUDE.md

AI English Tutor 是个人使用的英语场景对话练习应用。当前产品边界是“选择场景 → 与 AI 对话 → 获得即时纠错与学习记录”；不要把主线改成技能短课或课程闯关，除非用户明确改变方向。

## 先读这里

- 包管理器固定为 `pnpm 10.7.1`，不要使用 npm 或 yarn。
- 日常开发运行 `pnpm local`：后端 `3000`，前端 `6173`。
- 先查看目标代码和相邻测试；不要为了解项目遍历 `.claude/`、`.dev-data/` 或旧规划文档。
- `.context/INDEX.md` 只保存当前决策和近期修复的索引，需要追溯时再按条目读取。
- `.dev-data/` 是本地运行数据，不是实现依据；数据库文件不可随意删除。

## Workspace

| 路径                | 职责                                   |
| ------------------- | -------------------------------------- |
| `apps/tutor-app`    | Vue 3 SPA：Vite、Pinia、UnoCSS         |
| `apps/tutor-server` | Fastify API：SQLite、LLM、ASR、TTS     |
| `packages/shared`   | 前后端共享类型、场景和静态数据         |
| `gateway`           | Nginx HTTPS / WebSocket / SSE 反代     |
| `scripts`           | 按功能分组的开发、配置、部署和诊断脚本 |

主要请求链路：页面组件 → Pinia store → `apps/tutor-app/src/api/` → Fastify route → service/provider → SQLite。修改接口时同步检查共享类型、前端调用、后端 schema 和测试。

## 常用命令

```bash
pnpm local                         # 前后端本地开发
pnpm dev                           # 仅前端
pnpm server                        # 仅后端
pnpm dev:clean                     # 清理 3000/6173 残留进程
pnpm typecheck
pnpm build
pnpm --filter tutor-app test
pnpm --filter @ai-english-tutor/server test
pnpm push:server                   # rsync + Docker Compose 远程部署
pnpm deploy:cosyvoice              # 单独构建/部署 CosyVoice
```

脚本用途和直接调用方式见 `scripts/README.md`。

## 实现约束

- 后端和 shared 都是 ESM；相对 import 必须写运行时 `.js` 后缀，例如 `import { config } from './config.js'`。
- 新增 LLM Provider 放在 `apps/tutor-server/src/ai/providers/`，优先继承 `openai-base.ts`，并在 `ai/llm/factory.ts` 注册。
- 新增 ASR/TTS Provider 放在 `apps/tutor-server/src/voice/providers/`，并在 `voice/asr.ts` 或 `voice/tts.ts` 注册。
- 新增或修改环境变量时，同时更新 `.env.example`、`apps/tutor-server/src/config.ts`、配置生成与校验脚本。
- 部署数据目录由 `AI_TUTOR_HOME` 指定；生产配置位于 `${AI_TUTOR_HOME}/data/.env`，不要将密钥提交到仓库。
- Docker 服务使用固定网络 `tutor-net`；Node 后端由 Compose 的 `restart: unless-stopped` 保活。
- 对话流中的 `requestId` 要贯穿消息、流式响应和重试逻辑，避免旧请求覆盖新状态。
- 学习记录只有在对应业务操作成功后才能计数；不要用重复提交或重试放大统计。

## 完成标准

根据改动范围至少运行 `pnpm typecheck` 和相关 workspace 测试。部署脚本改动还需执行 Shell 语法检查、`docker compose config`，并用 `pnpm push:server -- --dry-run` 检查流程。完成后更新仍然有效的文档，避免新增一次性计划和重复说明。
