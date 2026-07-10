import { logger } from '../../logger.js'
import type { TTSProvider } from '../../voice/tts.js'

/**
 * TTS 输出模块：将文本合成为音频并返回 base64。
 */
export class TtsOutput {
  constructor(private tts: TTSProvider) {}

  /**
   * 通过 TTS 将文本合成为语音。
   * 返回 base64 音频（如果有）。
   *
   * browser 模式下真正的音频由前端 Web Speech API 生成，后端无需合成；
   * 直接返回 {} 避免白等 300ms 静音兜底 + 广播无用静音。
   */
  async handleOutput(
    text: string,
    voiceDesign?: string,
  ): Promise<{ audioBase64?: string }> {
    if (this.tts.name === 'browser') {
      return {}
    }

    if (!text || text.trim().length === 0) {
      return {}
    }

    try {
      logger.debug({ textLength: text.length }, '生成 TTS 音频')
      const audioBuffer = await this.tts.synthesize(text, { voiceDesign })
      const audioBase64 = audioBuffer.toString('base64')

      logger.info({ size: audioBuffer.length }, 'TTS 音频生成完成')

      return { audioBase64 }
    } catch (err) {
      logger.error({ err }, 'TTS 音频生成失败')
      return {}
    }
  }

  /**
   * 直接将文本合成为音频缓冲区（不广播）。
   * 用于在英语之外同步播放中文 TTS。
   *
   * browser 模式不支持直接合成（前端走 Web Speech API，后端无音频产出）。
   */
  async synthesizeDirect(text: string, voiceDesign?: string): Promise<Buffer> {
    if (this.tts.name === 'browser') {
      throw new Error('browser 模式不支持直接合成')
    }
    return this.tts.synthesize(text, { voiceDesign, format: this.tts.outputFormat })
  }
}
