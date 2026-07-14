# AI English Tutor

一个基于 AI 的英语口语陪练应用，支持 Live2D / Spine 2D 角色动画、语音交互、实时流式对话和场景化教学。

## 功能特性

- 🎭 **3D 角色渲染** — Live2D Cubism 和 Spine 骨骼动画，支持口型同步、表情切换、动作播放
- 🎙️ **语音交互** — 浏览器录音 → MP3 转码 → ASR 语音识别，支持多种 TTS 引擎
- 💬 **流式对话** — SSE 实时推送 AI 回复，逐字显示，音频流同步播放
- 📚 **场景化教学** — 餐厅点餐、购物砍价、旅行问路等生活场景，词汇驱动进度
- 📊 **词汇追踪** — 自动提取生词，IndexedDB 本地持久化，离线同步，间隔重复复习
- 🎨 **11 种角色风格** — 俏皮可爱、温柔知性、慵懒御姐等，每种配有结构化音色描述（小米 TTS voicedesign）
- 🌐 **PWA + 离线** — 一键添加到主屏，断网时显示提示横幅，词汇数据本地缓存
- 📱 **移动端适配** — iOS Safari 完整支持（音频解锁、键盘适配、安全区域）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Pinia + UnoCSS + Vite |
| 角色渲染 | Live2D Cubism SDK / Spine WebGL |
| 后端 | Fastify + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| LLM | DeepSeek / OpenAI / 小米 MiLM |
| TTS | 小米 MiMo voicedesign / CosyVoice / OpenAI / 浏览器 SpeechSynthesis |
| ASR | Whisper.cpp / 小米 ASR / OpenAI Whisper |
| 部署 | Docker Compose (Nginx 网关 + 前后端分离) |

## 项目结构

```
ai-english-tutor/
├── apps/
│   ├── tutor-app/                # 前端 SPA
│   │   ├── src/
│   │   │   ├── audio/            # 录音、播放、MP3 转码
│   │   │   ├── client/           # TutorClient (SSE + HTTP)
│   │   │   ├── components/       # Vue 组件
│   │   │   ├── composables/      # 组合式函数 (useAudio*, useVocabSync, useOnlineStatus)
│   │   │   ├── providers/        # 角色渲染 Provider (Live2D, Spine)
│   │   │   ├── stores/           # Pinia 状态管理
│   │   │   └── lib/              # IndexedDB 封装、Live2D Framework
│   │   └── public/               # 静态资源 (模型、着色器)
│   └── tutor-server/             # 后端 API
│       └── src/
│           ├── ai/               # LLM 引擎、Prompt 模板、会话管理
│           ├── db/               # SQLite 数据层
│           ├── routes/           # API 路由 (chat, voice, vocab, scenarios)
│           ├── voice/            # TTS / ASR 服务及 Provider
│           └── vocab/            # 词汇数据、场景配置加载
├── packages/
│   └── shared/                   # 前后端共享类型、角色定义、场景配置
├── gateway/                      # Nginx 反向代理
└── docker-compose.yml
```

## 快速开始

### 环境要求

- **Node.js** >= 18
- **pnpm** >= 10（项目使用 `pnpm@10.7.1`）
- **Chrome / Edge**（Live2D 需要 WebGL 2.0）

### 1. 安装依赖

```bash
git clone <repo-url>
cd ai-english-tutor
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

**最小配置**（DeepSeek + 浏览器 TTS/ASR）：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-key-here
TTS_PROVIDER=browser
ASR_PROVIDER=browser
```

### 3. 启动开发服务器

```bash
pnpm local          # 前端 + 后端同时启动（推荐日常使用）
# 或分别启动
pnpm dev            # 前端 → http://localhost:6173
pnpm server         # 后端 → http://localhost:3000
```

打开浏览器访问 `http://localhost:6173`，点击「开始上课」即可体验。

### 4. 构建生产版本

```bash
pnpm build
```

## 配置指南

### LLM 提供商

| 提供商 | `LLM_PROVIDER` | Key | 模型 |
|--------|----------------|-----|------|
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat`，或火山方舟接入点 ID |
| 小米 MiLM（已停用） | `xiaomi` | `XIAOMI_API_KEY` | `milm-pro` |
| Mock（开发用） | `mock` | 无 | — |

### TTS 语音合成

| 引擎 | `TTS_PROVIDER` | 说明 |
|------|----------------|------|
| 浏览器 | `browser` | 无需后端，使用系统语音（默认） |
| 火山方舟 | `volcengine` | 云 API，需 `VOLCENGINE_TTS_API_KEY` |
| CosyVoice | `cosyvoice` | 需要 Docker 启动 CosyVoice 服务 |
| 小米 MiMo（已停用） | `xiaomi` | voicedesign 模式，通过 `voiceDesign` 描述角色音色 |

**角色音色系统**：每种风格的 `voiceDesign` 采用结构化格式（【角色】【场景】【指导】），包含语速、气息、音色、情绪四维描述，作为 prompt 发送给小米 TTS voicedesign 模型。默认风格为「慵懒御姐」。

### ASR 语音识别

| 引擎 | `ASR_PROVIDER` | 说明 |
|------|----------------|------|
| 浏览器 | `browser` | 前端浏览器识别，无需后端（默认） |
| 火山方舟 | `volcengine` | 云 API，需 `VOLCENGINE_ASR_API_KEY` |
| Whisper.cpp | `whisper` | 需要 Docker 启动 Whisper 服务 |
| 小米 ASR（已停用） | `xiaomi` | 需要 `XIAOMI_API_KEY`，支持 mp3/wav |

> 录音自动转 MP3 (16kHz mono 64kbps) 后上传，兼容所有 ASR 提供商。

### 角色渲染

通过 `VITE_CHARACTER_PROVIDER` 切换：

| 类型 | 说明 |
|------|------|
| `live2d` | Live2D Cubism 模型（默认） |
| `spine` | Spine 骨骼动画 |
| `svg` | SVG 占位符（无 3D 渲染） |

## Docker 部署

### 一键启动

```bash
docker compose up -d
```

访问 `http://localhost`（端口 80）。

### 架构

```
浏览器 → Gateway (Nginx :80)
            ├── /         → Frontend (Nginx SPA)
            └── /api/*    → Backend (Fastify :3000)
```

### 可选：启用 GPU 语音服务

编辑 `docker-compose.yml`，取消注释 `cosyvoice` 和 `whisper` 服务，然后更新 `.env`：

```env
TTS_PROVIDER=cosyvoice
ASR_PROVIDER=whisper
```

### 自定义配置

Docker 部署支持外挂宿主机配置目录 `~/.ai-english-tutor/`：

```
~/.ai-english-tutor/
├── .env                  # 环境变量
├── persona.json          # 角色人设自定义
├── scenarios.json        # 教学场景自定义
├── vocab/                # 词汇数据
└── data/                 # SQLite 数据库
```

## API 文档

```bash
curl http://localhost:3000/health
# → { "status": "ok" }
```

### 对话

```bash
# 发送消息（流式）
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"type":"user.speak","text":"Hello!","level":1,"stream":true}'

# 开始课程
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"type":"lesson.start","level":1}'

# 水平测评（3 轮对话，支持 topicSeed 话题多样化）
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"type":"level.assess","text":"start","round":1,"previousScores":[],"topicSeed":"travel"}'
```

### SSE 流

```bash
curl http://localhost:3000/api/chat/stream
# event: teacher.chunk    → {"chunk":"Hello","isEnd":false}
# event: teacher.response → {"text":"Hello! ...","motionId":"wave","expressionId":"happy"}
```

### 语音

```bash
# 文字转语音
curl -X POST http://localhost:3000/api/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello world"}' --output speech.mp3

# 语音转文字
curl -X POST http://localhost:3000/api/asr \
  -F 'audio=@recording.mp3'

# 中文翻译 + TTS
curl -X POST http://localhost:3000/api/voice/chinese-tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello, how are you?"}' --output chinese.mp3
```

### 词汇

```bash
curl http://localhost:3000/api/vocab/A1                    # 某级别词汇
curl http://localhost:3000/api/vocab/random/2?count=5       # 随机练习词
curl http://localhost:3000/api/vocab/lookup/apple           # 查询单词
curl http://localhost:3000/api/vocab/progress/<userId>      # 学习进度
```

### 场景

```bash
curl http://localhost:3000/api/scenarios                    # 列出所有场景
curl http://localhost:3000/api/scenarios?level=1            # 按级别筛选
curl http://localhost:3000/api/scenarios/restaurant-ordering # 场景详情
```

## 常见问题

**Q: 页面打开后角色不显示？**
A: 检查浏览器是否支持 WebGL 2.0（`chrome://gpu`）。Live2D 需要 WebGL 支持。

**Q: iOS 上点击「开始上课」没有声音？**
A: iOS Safari 要求用户手势触发音频播放。应用在按钮点击时自动解锁音频。

**Q: 录音按钮无反应？**
A: 录音需要 HTTPS 或 localhost。确认浏览器已授予麦克风权限。iOS Safari 需要 iOS 14+。

**Q: 如何切换 LLM 提供商？**
A: 修改 `apps/tutor-server/.env` 中的 `LLM_PROVIDER` 和对应 API Key，重启后端。

**Q: 如何添加自定义角色模型？**
A: 将 Live2D 模型放入 `apps/tutor-app/public/models/`，或 Spine 模型放入对应目录，修改 `src/providers/` 中的路径配置。

## 端口一览

| 端口 | 服务 | 说明 |
|------|------|------|
| 80 | Gateway | Docker 生产环境 |
| 3000 | Backend | Fastify API 服务 |
| 6173 | Frontend | Vite 开发服务器 |
| 4173 | Frontend | Vite 预览服务器 |
| 50000 | CosyVoice | 可选 TTS 服务 |
| 8080 | Whisper | 可选 ASR 服务 |

## 第三方 Live2D 素材声明

本仓库内置 3 个 Live2D Inc. 官方 sample 模型,均遵循 **Live2D Free Material License Agreement**(全文见 [`LICENSE-Live2D.md`](./LICENSE-Live2D.md)):

| 模型 | 路径 | 出处 | 备注 |
|---|---|---|---|
| Hiyori Momose | `apps/tutor-app/public/models/hiyori/` | Live2D Cubism SDK Sample | 默认角色,**不得对角色设计作任何改动** |
| Shizuku | `apps/tutor-app/public/models/shizuku/` | [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) `live2d-models/shizuku/` | **保持角色名与设定不变** |
| Mao Pro | `apps/tutor-app/public/models/mao_pro/` | [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) `live2d-models/mao_pro/` | Mao Niziiro,无附加条款 |

各模型目录下保留了原始 `ReadMe.txt`(协议要求) + `LICENSE-Live2D.md` 副本。**本项目目前为个人学习用途;商业化(订阅/卖软件/企业版)前必须向 Live2D Inc. 取得商业 license。**

## License

Private — 仅供个人学习使用。
