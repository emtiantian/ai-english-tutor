# 远程 ASR Docker 测试方案

> 关联提交：上下文记忆条目《远程 ASR Docker 测试方案》  
> 适用服务器：`haohe@100.100.132.72`（生产部署目标机）  
> 版本：2026-06-18

## 1. 背景

AI English Tutor 默认使用 **Whisper.cpp** 作为 ASR（自动语音识别）Provider。Whisper 以 Docker 容器运行在远程服务器上，后端通过 Docker 内部网络 `http://whisper:8080` 访问，**不直接暴露到宿主机或公网 8080 端口**。

因此验证远程 ASR 是否可用，需要分层测试：

1. 容器是否正常运行
2. Whisper HTTP 服务是否健康
3. Whisper 直接推理是否返回正确文本
4. 后端 `/api/asr` API 是否能完整走通

## 2. 架构回顾

```
浏览器/客户端
    │
    ▼
gateway:80 (Nginx)
    │
    ├──► backend:3000 (Fastify)
    │       │
    │       └──► whisper:8080 (whisper.cpp server)
    │
    └──► frontend:80 (Vite SPA)
```

关键配置（来自 `.env.example`）：

```ini
ASR_PROVIDER=whisper
WHISPER_BASE_URL=http://whisper:8080
WHISPER_MODEL=ggml-base.en.bin
```

后端 `apps/tutor-server/src/voice/providers/whisper-asr.ts` 调用：

- `POST ${WHISPER_BASE_URL}/inference`
- `Content-Type: multipart/form-data`
- 字段：`file`（音频文件）、`language`（可选）、`response_format=json`
- 返回：`{ text, language }`

## 3. 测试音频规范

前端上传给后端的音频格式：

| 参数 | 值 |
|------|-----|
| 采样率 | 16kHz |
| 声道 | 单声道 (mono) |
| 编码 | MP3 |
| 码率 | 64kbps |

测试脚本生成的音频严格遵循此格式，确保与生产链路一致。

## 4. 脚本说明

### 4.1 `scripts/generate-test-audio.sh`

生成标准 ASR 测试音频。

```bash
# 默认输出到 ./.dev-data/test-asr.mp3
./scripts/generate-test-audio.sh

# 指定输出路径
./scripts/generate-test-audio.sh /tmp/my-test.mp3
```

实现逻辑：

- macOS 优先使用 `say` 生成真人语音测试音频（英文句子 `"Hello, I would like to order a cup of coffee."`）
- 无 `say` 时使用 ffmpeg 生成 440Hz 正弦波（用于格式/连通性测试）
- 最终统一用 ffmpeg 转码为 16kHz mono MP3 64kbps

### 4.2 `scripts/test-remote-asr.sh`

一键执行 L1~L4 四层测试。

```bash
# 自动生成测试音频并测试
./scripts/test-remote-asr.sh

# 使用自己的音频文件
./scripts/test-remote-asr.sh /path/to/test.mp3
```

测试分层：

| 层级 | 名称 | 命令核心 | 通过标准 |
|------|------|----------|----------|
| L1 | 容器状态 | `docker compose ps whisper` | 容器 `Up` |
| L2 | 服务健康 | 在 docker 网络内 `curl http://whisper:8080/health` | HTTP 200 |
| L3 | 直接推理 | 在 docker 网络内 `POST /inference` | 返回含 `text` 的 JSON |
| L4 | 后端 API | `curl -X POST http://100.100.132.72/api/asr` | 返回含 `text` 的 JSON |

## 5. 手动复现命令

### 5.1 生成测试音频（macOS）

```bash
say -o /tmp/test-asr.wav --data-format=LEI16@16000 "Hello, I would like to order a cup of coffee."
ffmpeg -i /tmp/test-asr.wav -ar 16000 -ac 1 -b:a 64k /tmp/test-asr.mp3
```

### 5.2 L1 容器状态

```bash
ssh haohe@100.100.132.72 "cd ~/.ai-english-tutor/app && docker compose ps whisper"
```

### 5.3 L2 健康检查

```bash
ssh haohe@100.100.132.72 \
  "docker run --rm --network ai-english-tutor_tutor-net alpine sh -c 'apk add --no-cache curl && curl -v http://whisper:8080/health'"
```

### 5.4 L3 直接推理

```bash
scp /tmp/test-asr.mp3 haohe@100.100.132.72:/tmp/test-asr.mp3

ssh haohe@100.100.132.72 \
  "docker run --rm --network ai-english-tutor_tutor-net -v /tmp:/tmp alpine sh -c 'apk add --no-cache curl && curl -s -X POST http://whisper:8080/inference -F file=@/tmp/test-asr.mp3 -F response_format=json'"
```

### 5.5 L4 后端 API

```bash
curl -s -X POST http://100.100.132.72/api/asr \
  -F "file=@/tmp/test-asr.mp3;type=audio/mpeg"
```

## 6. 故障排查

| 现象 | 可能原因 | 排查命令 |
|------|----------|----------|
| L1 失败 | Whisper 容器未启动 | `docker compose logs whisper` |
| L2 失败 | 模型加载中/崩溃 | `docker logs ai-english-tutor-whisper-1` |
| L3 失败，L2 正常 | 音频格式不对 | `ffprobe -show_streams /tmp/test-asr.mp3` |
| L4 失败，L3 正常 | 后端配置错误 | 检查 `~/.ai-english-tutor/data/.env` 中 `WHISPER_BASE_URL` 和 `ASR_PROVIDER` |
| L4 返回 413 | 音频超过大小限制 | 确认音频 < `MAX_AUDIO_SIZE_MB`（默认 10MB） |

## 7. 设计决策记录

1. **为什么不直接 curl 远程 8080？**  
   `docker-compose.yml` 中 whisper 服务没有 `ports:` 映射，8080 只在 Docker 内部网络可访问。外部测试必须走 `gateway:80 → backend:3000` 或 SSH 进宿主机用容器网络。

2. **为什么用 16kHz mono MP3？**  
   与前端 `useAudioEncoder.ts` + lamejs worker 输出格式一致，保证测试结果能代表真实用户链路。

3. **为什么 L3 用 `docker run --network` 而不是 `docker exec whisper`？**  
   避免依赖具体容器名，且使用独立 alpine+curl 容器更轻量、无副作用。

4. **为什么 L1~L4 顺序执行但失败不中断？**  
   一次性拿到全部分层诊断信息，比逐层排查更高效。

## 8. 后续可扩展

- 增加 `--tunnel` 模式：临时把 whisper 8080 通过 SSH 端口转发到本地，方便本地开发直接调试。
- 增加 `--benchmark` 模式：连续发送 N 条音频，统计平均延迟和错误率。
- 增加 `--compare` 模式：同时对比 whisper/xiaomi/openai 三个 provider 的识别结果。
