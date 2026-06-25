# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### 🚀 Features

#### 角色音色系统

- **11 种角色风格全面升级**：所有风格的 `voiceDesign` 从一句话描述升级为结构化详细定义（【角色】【场景】【指导】），包含语速、气息、音色、情绪四维指导，大幅提升小米 TTS voicedesign 模型的语音表现力
- **默认音色改为慵懒御姐**：未选择风格时默认使用 `lazy-mature`，不再随机

#### 水平测评

- **3 轮对话式测评**：CEFR A1-C2 分级，4 维评分（词汇、语法、流利度、理解力），加权计算最终等级
- **测评问题多样化**：`topicSeed` 话题种子机制，34 个话题池，每轮 10+ 话题可选，禁止跨轮重复
- **语音输入支持**：测评过程中可使用语音回答，录音自动转 MP3 上传
- **初始触发优化**：首轮 `text='start'` 不再作为学生回答评估，仅生成欢迎语和第一个问题
- **测评响应处理集中化**：`store.processAssessmentResponse()` 统一评分逻辑，文本和语音路径共用

#### 语音交互

- **录音转 MP3**：浏览器录音通过 lamejs 转换为 16kHz mono 64kbps MP3，兼容小米 ASR，文件体积比 WAV 小 10 倍
- **中文翻译 TTS**：`/api/voice/chinese-tts` 端点，英文→中文翻译 + 小米 TTS 合成，支持重听中文释义
- **翻译超时保护**：LLM 翻译添加 15s 超时，避免请求挂起
- **请求体限制提升**：Fastify bodyLimit 从 1MB 提升至 25MB，支持大音频上传

#### 流式对话

- **SSE 推送优化**：handler 重构，支持更灵活的事件广播和会话管理
- **流式对话简化**：`sendText` 改为 fire-and-forget，SSE 负责消息终态和场景更新
- **音频 chunk 隔离**：按消息 ID 隔离音频缓冲区，新消息到达时刷新前一条的音频，防止串流

#### 词汇与场景

- **词汇本地持久化**：IndexedDB 存储已学单词，页面刷新不丢失
- **词汇离线同步**：离线时学到的单词加入待同步队列，恢复网络后自动批量同步
- **场景进度词汇驱动**：进度计算从 LLM 自报告改为确定性的 `wordsLearned / targetWordsTotal`
- **词汇 API 超时控制**：`getVocabProgress` 和 `getDueReviewWords` 添加 15s AbortController 超时

#### PWA 与离线

- **PWA 支持**：`vite-plugin-pwa`，一键添加到主屏（iOS/Android），Service Worker 预缓存 + 运行时缓存
- **离线提示横幅**：断网时显示 OfflineBanner 组件

#### 部署与配置

- **Docker 部署外挂宿主机配置目录**：`~/.ai-english-tutor/` 目录结构，挂载 `.env`、`persona.json`、`scenarios.json`、`vocab/`、`data/`
- **角色/场景运行时加载**：`persona.json` 和 `scenarios.json` 支持运行时自定义，无需重新编译
- **Dockerfile 锁定 lockfile**：COPY `pnpm-lock.yaml`，确保可复现构建
- **ASR 默认改为 whisper**：`ASR_PROVIDER` 默认值从 `mock` 改为 `whisper`
- **HTTPS 开发服务器**：支持本地 HTTPS，解决 iOS Safari 录音限制

### 🐛 Bug Fixes

- **修复音频串流**：多个回复的音频 chunk 交叉污染，改为按消息 ID 隔离
- **修复测评首轮误评估**：`text='start'` 被当作学生回答评分
- **修复 Live2D 鼠标事件泄漏**：`destroy()` 未移除 mousemove/click 监听器
- **修复 composable 初始化顺序**：`useVocabSync` 延迟绑定，避免 `learnWords` 未定义
- **修复竞态条件**：SSE + HTTP 双重响应导致消息重复处理
- **修复重复 useVocabSync 实例**：useTutorClient 和 App.vue 各创建一个，改为单实例 + 回调注入
- **修复非空断言崩溃**：`getScenarioById()` 改为 null check，缺失时回退到自由对话
- **修复 `pnpm dev:all` 启动报错**：`tsx watch` 子 shell 死循环，改为直接调用
- **修复场景教学提示词**：移除重复的 OUTPUT FORMAT，避免 LLM 输出格式混乱
- **修复场景进度不更新**：改为词汇驱动的确定性进度计算
- **修复语音消息不更新场景进度**：`useAudioRecorder` 正确处理 `response.scenario`
- **修复刷新页面音频继续播放**：`beforeunload` 停止 AudioContext 和 speechSynthesis
- **修复 Live2D 窗口 resize 模型错位**：重新计算 modelMatrix 缩放和居中
- **修复 Live2D 口型同步生硬**：指数平滑插值（factor=0.15）
- **增大 Live2D 口型开合幅度**：音量 1.8x + 口型 1.5x，总计约 2.7x

### 💄 UI Improvements

- **重听按钮**：emoji 🔊 → SVG 音量图标，圆形无边框，hover 放大 + 点击缩放
- **中文翻译按钮**：消息气泡内嵌中文重听按钮，支持缓存和加载状态
- **词汇标签**：11px → 13px，「📚 生词」标签头，渐变背景 + hover 上浮
- **场景进度集成到输入栏**：显示目标词汇学习进度、当前提示和建议短语
- **场景进度改为词汇导向**：百分比 = 已学词汇数 / 总目标词汇数
- **语音风格 + 场景选择合并**：风格下拉框移入 ScenarioPicker 弹窗

### 🔧 Internal

- **useTutorClient 解耦**：移除对 useVocabSync 的直接依赖，改为 `onLearnWords` 回调注入
- **Live2D 鼠标事件引用存储**：dispose 时正确清理 mousemove/click 处理器
- **vocab/db 新增 IndexedDB 封装**：words / pending-sync / scenario-progress 三张表
- **useOnlineStatus composable**：在线状态检测
- **useVocabSync composable**：本地持久化 + 离线队列 + 上线同步
- **scripts/init-host-dir.sh**：一键创建宿主机配置目录
- **scripts/dev-local.sh / kill-ports.sh**：开发辅助脚本
- `.claude/` 和 `.codegraph/` 从 git 跟踪移除，加入 `.gitignore`
