# 音频 Worker 说明

## 当前状态

`src/workers` 目前只保留 `worker-types.d.ts`，没有实际的 Worker 脚本。

这个目录保留的原因是：早期浏览器录音方案曾经需要在 Worker 中调用 FFmpeg，对浏览器录制出来的音频重新编码，再提交给 ASR 服务。`worker-types.d.ts` 是当时为音频编码 Worker 预留的类型声明，不代表当前已经存在可运行的编码 Worker。

当前正式代码使用浏览器的 Web Speech API：

```text
useAudioRecorder
  → recognizeSpeech
  → SpeechRecognition / webkitSpeechRecognition
  → 返回 transcript 文本
  → 发送文本给对话接口
```

因此当前链路不会上传浏览器录音文件，也不会执行音频格式转换。

## 浏览器录音格式

浏览器录音通常通过 `MediaRecorder` 获取 `Blob`。格式由浏览器和操作系统决定，不能假设所有浏览器都返回同一种格式：

| 浏览器           | 常见 MIME 类型                | 常见编码                         |
| ---------------- | ----------------------------- | -------------------------------- |
| Chrome / Firefox | `audio/webm;codecs=opus`      | WebM 容器 + Opus                 |
| Safari           | `audio/mp4`                   | MP4 容器，具体音频编码由系统决定 |
| 部分浏览器回退   | `audio/webm` 或浏览器默认格式 | 由浏览器决定                     |

项目中的格式探测代码位于 `src/audio/utils.ts` 的 `resolveRecorderMimeType()`，当前候选顺序是：

```ts
;['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', '']
```

需要注意：`MediaRecorder` 返回的是压缩后的容器文件，不是裸 PCM。即使文件扩展名被改成 `.wav`，也不会因此变成 WAV。

当前代码使用的是 `SpeechRecognition`，它直接把浏览器内部采集的声音交给浏览器语音识别服务，并返回文本。因此当前 `useAudioRecorder.ts` 中的“录音”主要表示语音识别会话，不等于拿到了一个可上传的音频文件。

## ASR 常见输入格式

不同 ASR 服务的要求不同，常见要求包括：

- WAV 容器
- PCM 编码
- 单声道
- 16-bit little-endian
- 采样率 16 kHz 或 8 kHz

而浏览器常见输出可能是 WebM/Opus 或 MP4/AAC，两者与“16 kHz、单声道、16-bit PCM WAV”并不相同，所以不能直接把浏览器录音 Blob 当作 WAV 上传。

实际接入某个 ASR Provider 前，应以该 Provider 的官方接口文档为准，确认：容器格式、编码、声道数、采样率、位深、最大时长和最大文件大小。

## FFmpeg 方案

### 浏览器端 FFmpeg

如果必须在浏览器内转换，常用包是：

- `@ffmpeg/ffmpeg`：浏览器端 FFmpeg JavaScript API
- `@ffmpeg/core`：FFmpeg WebAssembly 核心文件

通常在 Worker 中运行，避免 FFmpeg 转码阻塞主线程。典型转换目标是单声道 16 kHz PCM WAV：

```text
输入：recording.webm
输出：recording.wav
参数：-ac 1 -ar 16000 -sample_fmt s16
```

伪代码流程：

```ts
// 主线程
const worker = new Worker(new URL('./audio-encoder.worker.ts', import.meta.url), {
  type: 'module'
})

worker.postMessage(
  {
    type: 'encode',
    name: 'recording.webm',
    data: await blob.arrayBuffer()
  },
  [arrayBuffer]
)

// Worker 内部
await ffmpeg.writeFile('recording.webm', new Uint8Array(data))
await ffmpeg.exec([
  '-i',
  'recording.webm',
  '-ac',
  '1',
  '-ar',
  '16000',
  '-sample_fmt',
  's16',
  'recording.wav'
])
const output = await ffmpeg.readFile('recording.wav')
postMessage({ type: 'encoded', data: output.buffer }, [output.buffer])
```

实际实现还需要处理：FFmpeg 核心文件加载、进度、超时、取消、Worker 销毁、错误信息、临时文件清理和 ArrayBuffer 转移。`@ffmpeg/ffmpeg` 和 `@ffmpeg/core` 体积较大，会明显增加首次加载成本，因此不应在没有真实 ASR 音频上传需求时提前接入。

### 服务端 FFmpeg

如果 ASR 请求本来就经过后端，通常更适合：

1. 浏览器上传原始 `webm` 或 `mp4`。
2. 后端使用系统 FFmpeg 转换成 ASR 要求的格式。
3. 后端把转换后的音频提交给 ASR Provider。

服务端命令示例：

```bash
ffmpeg -i input.webm -ac 1 -ar 16000 -sample_fmt s16 output.wav
```

这种方式不会把 FFmpeg WebAssembly 下载到每个用户浏览器，但需要服务器安装 FFmpeg，并处理上传大小、超时、临时文件和并发限制。

## 后续实现建议

如果未来恢复“上传音频给 ASR”的方案，建议按以下顺序实现：

1. 先确定实际 ASR Provider 的音频契约。
2. 使用 `MediaRecorder` 和 `resolveRecorderMimeType()` 采集音频。
3. 明确选择浏览器端 `@ffmpeg/ffmpeg`，或服务端系统 FFmpeg。
4. 把编码逻辑放进真实的 `audio-encoder.worker.ts`，不要继续把实现写进类型声明文件。
5. 为 Worker 增加取消、超时、失败重试和资源释放测试。
6. 只有在 ASR 接口验证通过后，再将它接回 `useAudioRecorder.ts`。
