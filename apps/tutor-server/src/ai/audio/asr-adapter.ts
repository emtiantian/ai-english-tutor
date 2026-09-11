import { logger } from '../../logger.js'
import type { ASRProvider } from '../../voice/asr.js'
import type { LLMProvider } from '../llm.js'

/**
 * ASR 适配器：根据 LLM 能力决定是否调用独立 ASR 提供商转写音频。
 */
export class AsrAdapter {
  constructor(
    private asr: ASRProvider,
    private llm: LLMProvider
  ) {}

  /**
   * 将音频转写为文本（仅 ASR，不构建消息）。
   * 返回转写后的文本；如果没有音频则返回原始文本。
   */
  async transcribeAudio(
    text: string,
    audioBase64: string | undefined,
    audioFormat: string
  ): Promise<string> {
    if (!audioBase64) {
      logger.info({ text: text.slice(0, 50) }, '[ASR] 未提供音频，直接使用文本')
      return text
    }

    // 如果 LLM 支持音频输入，则跳过 ASR
    if (this.llm.capabilities.supportsAudioInput) {
      logger.info(
        { llm: this.llm.name, asrProviderConfigured: this.asr.name },
        '[ASR] LLM 支持语音输入，音频直接发送给 LLM，不调用独立 ASR 提供商'
      )
      return text
    }

    // 使用 ASR 进行转写
    if (this.asr.name === 'browser') {
      throw new Error(
        'ASR_PROVIDER=browser 时，音频转写应由前端 Web Speech API 完成，服务端不支持直接转写'
      )
    }

    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64')
      logger.info(
        { provider: this.asr.name, audioSize: audioBuffer.length, format: audioFormat },
        '[ASR] 开始转写...'
      )
      const asrResult = await this.asr.transcribe(audioBuffer, `audio/${audioFormat}`)
      logger.info(
        {
          provider: this.asr.name,
          transcribed: asrResult.text.slice(0, 100),
          fullLength: asrResult.text.length
        },
        '[ASR] 转写完成'
      )
      return asrResult.text
    } catch (err) {
      if (text.trim()) {
        logger.warn({ err, provider: this.asr.name }, '[ASR] 转写失败，使用客户端提供的文本')
        return text
      }
      logger.error({ err, provider: this.asr.name }, '[ASR] 转写失败且没有可用文本')
      throw new Error('语音识别失败，请重试', { cause: err })
    }
  }
}
