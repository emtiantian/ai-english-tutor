import { logger } from '../../logger.js'
import type { ASRProvider } from '../../voice/asr.js'
import type { LLMProvider } from '../llm.js'

/**
 * ASR 适配器：根据 LLM 能力决定是否调用独立 ASR 提供商转写音频。
 */
export class AsrAdapter {
  constructor(
    private asr: ASRProvider,
    private llm: LLMProvider,
  ) {}

  /**
   * 将音频转写为文本（仅 ASR，不构建消息）。
   * 返回转写后的文本；如果没有音频则返回原始文本。
   */
  async transcribeAudio(
    text: string,
    audioBase64: string | undefined,
    audioFormat: string,
  ): Promise<string> {
    if (!audioBase64) {
      logger.info({ text: text.slice(0, 50) }, '[ASR] 未提供音频，直接使用文本')
      return text
    }

    // 如果 LLM 支持音频输入，则跳过 ASR
    if (this.llm.capabilities.supportsAudioInput) {
      logger.info(
        { llm: this.llm.name, asrProviderConfigured: this.asr.name },
        '[ASR] LLM 支持语音输入，音频直接发送给 LLM，不调用独立 ASR 提供商',
      )
      return text
    }

    // 使用 ASR 进行转写
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64')
      logger.info({ provider: this.asr.name, audioSize: audioBuffer.length, format: audioFormat }, '[ASR] 开始转写...')
      const asrResult = await this.asr.transcribe(audioBuffer, `audio/${audioFormat}`)
      logger.info({ provider: this.asr.name, transcribed: asrResult.text.slice(0, 100), fullLength: asrResult.text.length }, '[ASR] 转写完成')
      return asrResult.text
    } catch (err) {
      // ASR 失败时保留 return text 以维持调用方签名不变，但用 warn 明确标注失败，
      // 并根据是否有文本兜底区分两种情况，避免失败被静默掩盖
      const hasFallbackText = text.trim().length > 0
      if (hasFallbackText) {
        logger.warn({ err, provider: this.asr.name, text }, '[ASR] 转写失败，使用原始文本兜底')
      } else {
        logger.warn({ err, provider: this.asr.name }, '[ASR] 转写失败且无文本兜底，将返回空文本')
      }
      return text
    }
  }
}
