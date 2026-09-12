# AI English Tutor

面向第一版验证的英语场景对话练习 SPA。用户选择场景后，DeepSeek 生成角色对话，小米 TTS 播放老师语音；用户可输入文字或使用浏览器语音识别，回复中的基础单词可即时查看解释。

## 当前范围

- 场景选择与连续多轮对话
- DeepSeek LLM；Mock 仅用于测试和本地 UI 调试
- 小米 TTS，支持预设音色和独立于场景的 Voice Design
- 浏览器 Web Speech API 语音识别，不支持时使用文字输入
- 基础词汇提取、例句和即时查词
- 单个 Live2D 角色及 SVG 降级
- 内存会话；刷新、跨设备恢复和长期学习记录尚未实现

后续需求与已删除能力记录在 [优化计划](doc/优化计划.md)。删除的旧实现可从 Git 历史恢复，不在源码中保留归档副本。

## 技术栈

- `apps/tutor-app`：Vue 3、Vite、Pinia、UnoCSS
- `apps/tutor-server`：Fastify、TypeScript、SSE
- `packages/shared`：前后端共享类型与场景数据
- `gateway`：生产环境 Nginx 反向代理
- pnpm workspace，Node.js 22

## 本地开发

```bash
pnpm install
cp .env.example .env
pnpm setup
pnpm local
```

前端默认 `http://localhost:6173`，后端默认 `http://localhost:3000`。常用命令：

```bash
pnpm dev           # 仅前端
pnpm server        # 仅后端
pnpm dev:clean     # 清理开发端口
pnpm typecheck
pnpm --filter tutor-app test
pnpm --filter @ai-english-tutor/server test
pnpm build
```

## 配置

生产主路径需要：

```dotenv
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
TTS_PROVIDER=xiaomi
XIAOMI_TTS_API_KEY=...
ASR_PROVIDER=browser
```

小米 TTS 使用预设音色：

```dotenv
XIAOMI_TTS_MODE=preset
XIAOMI_TTS_VOICE=Chloe
```

使用 Voice Design 时，音色描述来自用户设置或独立默认配置，与场景和 LLM 人格无关：

```dotenv
XIAOMI_TTS_MODE=voicedesign
XIAOMI_TTS_VOICE_DESIGN=...
```

完整模板见 [.env.example](.env.example)。

## 部署和进程保活

生产部署地址：[https://emengtt.com](https://emengtt.com)。

```bash
bash scripts/config/init-host.sh
pnpm push:server
```

部署使用 Docker Compose。`backend`、`frontend` 和 `gateway` 都配置了 `restart: unless-stopped`，容器进程异常退出或 Docker 服务重启后会自动拉起，因此 Node 服务不需要 PM2。Docker 服务本身需要在宿主机启用开机启动。

部署脚本默认先执行类型检查、前后端测试和生产构建，要求 Git 工作区干净，然后备份、同步、构建容器并检查 `/api/health`。详见 [scripts/README.md](scripts/README.md)。
