import { config } from '../config.js'
import { CosyVoiceProvider } from './providers/cosyvoice.js'
import { XiaomiTTSProvider } from './providers/xiaomi-tts.js'
import { VolcengineTTSProvider } from './providers/volcengine-tts.js'

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
      // browser 模式由前端 Web Speech API 处理，后端不合成音频。
      // 保留该配置值是为了让 /api/config 能向前端声明本地 TTS；
      // 若服务端意外调用 synthesize 则直接抛错，避免生成无意义静音。
      return {
        name: 'browser',
        outputFormat: 'wav',
        async synthesize(): Promise<Buffer> {
          throw new Error(
            'TTS_PROVIDER=browser 时，语音合成应由前端 Web Speech API 完成，服务端不支持直接合成'
          )
        }
      }
    default:
      throw new Error(`不支持的 TTS 提供商: ${provider}。请在 .env 中设置正确的 TTS_PROVIDER。`)
  }
}
