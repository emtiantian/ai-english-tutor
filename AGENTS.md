# AGENTS.md

AI English Tutor 第一版是英语场景对话练习工具。核心闭环是：选择场景 → LLM 开场 → TTS 播放 → 用户文字或语音输入 → ASR 转写 → LLM 继续 → 查看基础单词。

## 工作原则

- 优先修复和简化核心闭环，不扩展课程体系、用户成长或运营功能。
- 多 Provider、缓存、持久化等能力可保留接口，但不要接入默认页面和核心请求链路。
- 第一版生产组合固定为 DeepSeek、小米 TTS 和浏览器 ASR。
- Voice Design 只表示用户选择的音色，不得由场景或 LLM 人格隐式决定。
- 开始工作先查看目标代码及相邻测试，不要遍历 `.claude/`、`.dev-data/` 和旧历史。
- 当前范围和精简顺序见 `doc/优化计划.md`；有效历史索引见 `.context/INDEX.md`。

## Workspace

- 包管理器：pnpm 10.7.1，只使用 pnpm。
- `apps/tutor-app`：Vue 3 SPA，端口 6173。
- `apps/tutor-server`：Fastify、TypeScript，端口 3000。
- `packages/shared`：共享类型与场景数据。
- `gateway`：Nginx 生产反代。

## 常用命令

```bash
pnpm local
pnpm dev:clean
pnpm typecheck
pnpm build
pnpm --filter tutor-app test
pnpm --filter @ai-english-tutor/server test
pnpm push:server
```

## 实现约束

- 后端与 shared 是 ESM，相对 import 必须带运行时 `.js` 后缀。
- 修改接口时同步检查共享类型、前端 Client、后端 route/schema 和测试。
- 新增环境变量时同步更新 `.env.example`、服务端配置及配置生成/校验脚本。
- 密钥不进入仓库；部署数据目录由 `AI_TUTOR_HOME` 指定。
- Node 服务由 Docker Compose 的 `restart: unless-stopped` 保活。
- 完成改动后运行类型检查和相关测试；部署脚本改动还需检查 Shell 语法和 Compose 配置。
