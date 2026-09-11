# AGENTS.md

本文件是项目唯一的 AI 工程规则来源，适用于所有编码 Agent。工具专用入口文件只引用本文件，不重复维护规则。

## 产品边界

AI English Tutor 第一版是英语场景对话练习工具。核心闭环是：选择场景 → DeepSeek 生成开场 → 小米 TTS 播放 → 用户文字或语音输入 → 浏览器 ASR 转写 → DeepSeek 继续回复 → 查看基础单词。

- 优先修复和简化核心闭环，不扩展课程体系、用户成长或运营功能。
- 多 Provider、缓存、持久化等能力可保留接口，但不要接入默认页面和核心请求链路。
- Voice Design 只表示用户选择的音色，不得由场景或 LLM 人格隐式决定。
- 当前范围和后续路线图见 `doc/优化计划.md`。

## Workspace

- 包管理器固定为 pnpm 10.7.1，只使用 pnpm。
- `apps/tutor-app`：Vue 3、Vite、Pinia、UnoCSS，开发端口 6173。
- `apps/tutor-server`：Fastify、TypeScript，开发端口 3000。
- `packages/shared`：前后端共享的类型、协议、场景数据和纯函数。
- `gateway`：Nginx 生产反向代理。
- `scripts`：开发、配置、部署和诊断脚本，结构见 `scripts/README.md`。

## 代码编写规则

- 业务代码使用 TypeScript；新增 JavaScript 前必须确认对应工具无法使用 TypeScript。
- 保持 TypeScript 严格类型，不使用 `any`、无依据的类型断言或 `@ts-ignore` 绕过问题。
- 实现前先搜索已有类型、函数、组件、composable、service 和 Provider；优先复用或扩展，避免复制近似实现。
- 一个模块只承担一种主要职责。页面和路由负责组织流程，业务规则放在可复用的 service、composable 或纯函数中。
- 前端组件不直接拼接后端协议；统一通过 client/API 层调用。后端 route 负责校验和 HTTP/SSE 转换，业务逻辑放在 engine/service。
- 前后端共同使用的请求、响应、事件、枚举和领域类型放在 `packages/shared`，不得分别维护两套相同定义。
- 只在单端使用的 UI 状态、数据库行类型或第三方 SDK 类型留在所属应用，不为“可能复用”提前放入 shared。
- 后端和 shared 均为 ESM，相对 import 必须写运行时 `.js` 后缀。
- 对外输入必须在边界校验；内部函数接收已经校验且类型明确的数据。
- 异步流程必须处理失败、取消和超时。对话请求的 `requestId` 要贯穿客户端、HTTP、SSE 和日志，防止旧响应覆盖新状态。
- 不在代码中写密钥、服务器密码和用户隐私数据；日志不得输出完整 token、音频或敏感请求体。
- 删除已经不可达的实现时，同步删除导出、配置、测试和文档，避免保留失效入口。

## 测试规则

- 测试代码与生产代码分目录存放：前端使用 `apps/tutor-app/tests/`，后端使用 `apps/tutor-server/tests/`，shared 使用 `packages/shared/tests/`。
- 不在 `src/` 下新增 `__tests__`。修改已有同目录测试时，优先将相关测试迁移到对应 `tests/` 目录。
- 单元测试覆盖纯业务规则和错误边界；集成测试覆盖 API、数据库、Provider 适配和关键对话链路。
- 测试行为和公开契约，不复制实现细节。Mock 只用于隔离外部服务，不要把被测核心逻辑一并 Mock 掉。
- 修复回归问题时增加能在修改前失败、修改后通过的测试；低风险文案和样式调整不强制新增测试。
- 测试数据、临时数据库和生成音频只能写入测试临时目录，不得污染 `.dev-data` 或生产数据目录。

## 配置与部署规则

- 新增或修改环境变量时，同步更新 `.env.example`、`apps/tutor-server/src/config.ts`、配置生成脚本和校验脚本。
- 环境变量只在配置模块读取，业务模块使用解析并校验后的配置对象。
- 密钥不提交到仓库；部署数据目录由 `AI_TUTOR_HOME` 指定。
- 数据库和用户数据必须通过 volume 或数据目录持久化，不写入容器镜像或源码目录。
- Node 服务由 Docker Compose 的 `restart: unless-stopped` 保活；Docker 服务使用固定网络 `tutor-net`。
- 部署变更必须考虑旧版本配置兼容、失败回滚和服务健康检查。

## 工作与验证

- 开始工作先查看目标代码和相邻测试，不要遍历 `.claude/`、`.dev-data/` 或旧历史。
- 修改接口时同步检查 shared 类型、前端 client、后端 route/schema 和测试。
- 不顺手重构无关代码，不把多类高风险改动混在同一提交。
- 根据改动范围至少运行 `pnpm typecheck` 和相关 workspace 测试。
- 部署脚本改动还需检查 Shell 语法、Compose 配置和 dry-run 流程。
- 完成后更新仍然有效的文档；不要创建会迅速过期的一次性计划。

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

需要追溯近期架构决策时查询 `.context/INDEX.md`，按索引只读取相关条目。
