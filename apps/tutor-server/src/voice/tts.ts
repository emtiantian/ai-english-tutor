import { config } from '../config.js'
import { logger } from '../logger.js'
import { CosyVoiceProvider } from './providers/cosyvoice.js'
import { XiaomiTTSProvider } from './providers/xiaomi-tts.js'
import { VolcengineTTSProvider } from './providers/volcengine-tts.js'

/**
 * TTS（文本转语音）Provider 接口
 */
export interface TTSProvider {
  readonly name: string

  /**
   * 将文本合成为语音音频
   * 返回音频数据 Buffer
   */
  synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer>

  /**
   * 流式合成文本为语音音频
   * 按生成顺序产出音频分块
   */
  synthesizeStream?(text: string, options?: TTSSynthesizeOptions): AsyncGenerator<Buffer>
}

export interface TTSSynthesizeOptions {
  /** 音色 ID */
  voice?: string

  /** 音频格式：mp3 | opus | aac | flac | wav | pcm */
  format?: string

  /** 语速倍数：0.25 ~ 4.0 */
  speed?: number

  /** 支持 voice design 的 TTS provider 使用的音色设计描述（例如 Xiaomi VoiceDesign） */
  voiceDesign?: string
}

/**
 * 浏览器 TTS Provider（直接调用 API 时的占位 / 兜底）。
 *
 * 当 TTS_PROVIDER=browser 时，真正的音频输出由前端通过 Web Speech API 生成；
 * 后端不进行合成。该 provider 仅返回一段静音 WAV，以避免独立的 `/api/tts`
 * 调用崩溃。
 */
class BrowserTTSProvider implements TTSProvider {
  readonly name = 'browser'

  async synthesize(_text: string, _options?: TTSSynthesizeOptions): Promise<Buffer> {
    logger.debug({ browser: true }, '浏览器 TTS 合成（静音兜底）')
    // 返回一段最小化的有效静音 WAV，防止下游音频解码器失败。
    await new Promise((resolve) => setTimeout(resolve, 300))
    return generateSilentWav()
  }
}

/**
 * 生成一段包含静音的最小有效 WAV 文件。
 * 用于浏览器 TTS 兜底且没有真实 API 音频产出的场景。
 */
function generateSilentWav(): Buffer {
  const sampleRate = 16000
  const channels = 1
  const bitsPerSample = 16
  const durationSeconds = 0.1
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
 * 根据配置创建 TTS provider
 */
export function createTTSProvider(): TTSProvider {
  const provider = config.TTS_PROVIDER

  switch (provider) {
    case 'xiaomi':
      return new XiaomiTTSProvider()
    case 'cosyvoice':
      return new CosyVoiceProvider()
    case 'volcengine':
      return new VolcengineTTSProvider()
    case 'browser':
      // 浏览器输出：前端走 SpeechSynthesis，后端不合成。这里仅作兜底。
      return new BrowserTTSProvider()
    default:
      logger.warn({ provider }, '未知 TTS 提供商，回退到浏览器')
      return new BrowserTTSProvider()
  }
}
