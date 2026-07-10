/**
 * WAV 容器工具函数
 *
 * 集中存放 PCM <-> WAV 转换、静音 WAV 生成、WAV data chunk 解析等通用逻辑，
 * 供 voice 目录下的 TTS / ASR provider 复用。
 */

/**
 * 将原始 PCM 打包成最小 WAV（RIFF）容器。
 *
 * 迁移自 cosyvoice.ts：CosyVoice fastapi 的 `server.py` 流式输出的是无头
 * int16 PCM，无法直接被浏览器 / `decodeAudioData` 播放。在前面加上 44 字节
 * 的 WAV 头后，输出就是自描述、通用可解码的音频 buffer。
 *
 * @param pcm - 原始 PCM 字节
 * @param sampleRate - 采样率（Hz）
 * @param channels - 声道数，默认 1
 * @param bitsPerSample - 位深，默认 16
 */
export function pcmToWav(
  pcm: Buffer,
  sampleRate: number,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  let offset = 0

  header.write('RIFF', offset); offset += 4
  header.writeUInt32LE(36 + dataSize, offset); offset += 4
  header.write('WAVE', offset); offset += 4

  header.write('fmt ', offset); offset += 4
  header.writeUInt32LE(16, offset); offset += 4 // PCM fmt chunk 大小
  header.writeUInt16LE(1, offset); offset += 2 // 音频格式 = PCM
  header.writeUInt16LE(channels, offset); offset += 2
  header.writeUInt32LE(sampleRate, offset); offset += 4
  header.writeUInt32LE(byteRate, offset); offset += 4
  header.writeUInt16LE(blockAlign, offset); offset += 2
  header.writeUInt16LE(bitsPerSample, offset); offset += 2

  header.write('data', offset); offset += 4
  header.writeUInt32LE(dataSize, offset)

  return Buffer.concat([header, pcm])
}

/**
 * 生成一段包含静音的最小有效 WAV 文件。
 *
 * 迁移自 tts.ts：用于浏览器 TTS 兜底且没有真实 API 音频产出的场景，
 * 防止下游音频解码器因空数据失败。
 *
 * @param sampleRate - 采样率（Hz），默认 16000
 * @param durationSeconds - 静音时长（秒），默认 0.1
 */
export function generateSilentWav(sampleRate = 16000, durationSeconds = 0.1): Buffer {
  const channels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const dataSize = Math.floor(sampleRate * durationSeconds) * blockAlign
  const fileSize = 36 + dataSize

  const buffer = Buffer.alloc(44 + dataSize)
  let offset = 0

  // RIFF chunk 描述符
  buffer.write('RIFF', offset); offset += 4
  buffer.writeUInt32LE(fileSize, offset); offset += 4
  buffer.write('WAVE', offset); offset += 4

  // fmt 子 chunk
  buffer.write('fmt ', offset); offset += 4
  buffer.writeUInt32LE(16, offset); offset += 4 // Subchunk1Size（PCM）
  buffer.writeUInt16LE(1, offset); offset += 2 // AudioFormat（PCM）
  buffer.writeUInt16LE(channels, offset); offset += 2
  buffer.writeUInt32LE(sampleRate, offset); offset += 4
  buffer.writeUInt32LE(byteRate, offset); offset += 4
  buffer.writeUInt16LE(blockAlign, offset); offset += 2
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2

  // data 子 chunk（静音已由 Buffer.alloc 初始化为 0）
  buffer.write('data', offset); offset += 4
  buffer.writeUInt32LE(dataSize, offset); offset += 4

  return buffer
}

/**
 * 解析 WAV 文件，定位 data chunk 并返回其中的原始 PCM 字节。
 *
 * 迁移自 volcengine-asr.ts 的 extractRawAudioFromWav：火山 ASR 要求发送
 * 裸 PCM，需要从 WAV 容器中剥离出 data chunk 内容。
 *
 * @param wavBuffer - 完整的 WAV 文件字节
 * @returns data chunk 中的原始 PCM 字节
 * @throws 找不到 data chunk 时抛错
 */
export function parseWavData(wavBuffer: Buffer): Buffer {
  // 解析 WAV 头，定位 data chunk
  let offset = 12
  while (offset < wavBuffer.length - 8) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4)
    const chunkSize = wavBuffer.readUInt32LE(offset + 4)
    if (chunkId === 'data') {
      return wavBuffer.subarray(offset + 8, offset + 8 + chunkSize)
    }
    offset += 8 + chunkSize
  }
  throw new Error('无效的 WAV 文件：未找到 data chunk')
}
