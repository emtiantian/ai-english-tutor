import { config } from '../config.js'
import { logger } from '../logger.js'
import { CosyVoiceProvider } from './providers/cosyvoice.js'
import { XiaomiTTSProvider } from './providers/xiaomi-tts.js'
import { VolcengineTTSProvider } from './providers/volcengine-tts.js'
import { generateSilentWav } from './wav-utils.js'

/**
 * TTS（文本转语音）Provider 接口
 */
export interface TTSProvider {
  readonly name: string

  /**
   * 该 provider 实际产出的音频格式（如 'mp3' / 'wav'）。
   * 用于 SSE 广播的 format 元数据与 /api/tts 的 Content-Type 对齐，
   * 避免硬编码 'mp3' 导致与真实字节不一致。
   */
  readonly outputFormat: string

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
  // 浏览器 TTS 返回静音 WAV 兜底（见 generateSilentWav）。
  readonly outputFormat = 'wav'

  async synthesize(_text: string, _options?: TTSSynthesizeOptions): Promise<Buffer> {
    logger.debug({ browser: true }, '浏览器 TTS 合成（静音兜底）')
    // 返回一段最小化的有效静音 WAV，防止下游音频解码器失败。
    await new Promise((resolve) => setTimeout(resolve, 300))
    return generateSilentWav()
  }
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
