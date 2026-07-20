import { config } from '../config.js'
import { VolcengineASRProvider } from './providers/volcengine-asr.js'
import { WhisperASRProvider } from './providers/whisper-asr.js'
import { XiaomiASRProvider } from './providers/xiaomi-asr.js'

/**
 * ASR（自动语音识别）Provider 接口
 */
export interface ASRProvider {
  readonly name: string

  /**
   * 将音频转写为文本
   * @param audioBuffer - 音频文件 buffer
   * @param mimeType - 音频文件的 MIME type
   */
  transcribe(audioBuffer: Buffer, mimeType?: string): Promise<ASRResult>
}

export interface ASRResult {
  /** 转写后的文本 */
  text: string

  /** 置信度分数（0-1），如果可用 */
  confidence?: number

  /** 检测到的语言 */
  language?: string
}

/**
 * 根据配置创建 ASR provider
 */
export function createASRProvider(): ASRProvider {
  const provider = config.ASR_PROVIDER

  switch (provider) {
    case 'whisper':
      return new WhisperASRProvider()
    case 'xiaomi':
      return new XiaomiASRProvider()
    case 'volcengine':
      return new VolcengineASRProvider()
    case 'browser':
      // browser 模式由前端 Web Speech API 处理，后端不执行转写。
      // 保留该配置值是为了让 /api/config 能向前端声明本地识别；
      // 若服务端意外收到音频则直接抛错，避免空转写掩盖问题。
      return {
        name: 'browser',
        async transcribe(): Promise<ASRResult> {
          throw new Error('ASR_PROVIDER=browser 时，音频转写应由前端 Web Speech API 完成，服务端不支持直接转写')
        },
      }
    default:
      throw new Error(`不支持的 ASR 提供商: ${provider}。请在 .env 中设置正确的 ASR_PROVIDER。`)
  }
}

/**
 * 返回当前配置的 ASR provider 名称。
 * 由 /api/config 接口使用。
 */
export function getConfiguredASRProvider(): string {
  return config.ASR_PROVIDER
}
