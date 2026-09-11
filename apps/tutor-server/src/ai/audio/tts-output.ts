import { logger } from '../../logger.js'
import type { TTSProvider } from '../../voice/tts.js'

/**
 * 尝试从可能是 JSON 字符串的文本中提取 `text` 字段。
 * 用于兜底：即使上层解析器未完全解包，TTS 也不应朗读 JSON 语法。
 */
function extractPlainTextFromPossibleJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return text
  }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed.text === 'string' && parsed.text.length > 0) {
      return parsed.text
    }
  } catch {
    // 不是有效 JSON，原样返回
  }
  return text
}

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
    signal?: AbortSignal
  ): Promise<{ audioBase64?: string }> {
    if (signal?.aborted) return {}
    if (this.tts.name === 'browser') {
      return {}
    }

    const plainText = extractPlainTextFromPossibleJson(text)
    if (plainText !== text) {
      logger.warn(
        { originalPreview: text.slice(0, 80), plainPreview: plainText.slice(0, 80) },
        'TTS 收到 JSON 字符串，已提取纯文本'
      )
    }

    if (!plainText || plainText.trim().length === 0) {
      return {}
    }

    try {
      logger.debug({ textLength: plainText.length, hasVoiceDesign: !!voiceDesign }, '生成 TTS 音频')
      const audioBuffer = await this.tts.synthesize(plainText, { voiceDesign })
      if (signal?.aborted) return {}
      const audioBase64 = audioBuffer.toString('base64')

      logger.info({ size: audioBuffer.length }, 'TTS 音频生成完成')

      return { audioBase64 }
    } catch (err) {
      logger.error(
        {
          err,
          textLength: plainText.length,
          hasVoiceDesign: !!voiceDesign,
          textPreview: plainText.slice(0, 100)
        },
        'TTS 音频生成失败'
      )
      return {}
    }
  }
}
