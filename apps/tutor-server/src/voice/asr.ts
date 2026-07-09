import { config } from '../config.js'
import { logger } from '../logger.js'
import { BrowserASRProvider } from './providers/browser-asr.js'
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
      return new BrowserASRProvider()
    default:
      logger.warn({ provider }, '未知 ASR 提供商，回退到浏览器')
      return new BrowserASRProvider()
  }
}

/**
 * 返回当前配置的 ASR provider 名称。
 * 由 /api/config 接口使用。
 */
export function getConfiguredASRProvider(): string {
  return config.ASR_PROVIDER ?? 'browser'
}
