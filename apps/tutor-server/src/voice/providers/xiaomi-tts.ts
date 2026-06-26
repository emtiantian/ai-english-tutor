import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../tts.js'
import { getOrSynthesizeCachedAudio } from '../tts-cache.js'
import { getOrGenerateVoiceSample } from '../voice-samples.js'

/**
 * Xiaomi MiMo TTS v2.5 Provider
 *
 * Supports three modes:
 * 1. preset      - mimo-v2.5-tts (built-in voices, supports singing)
 * 2. voicedesign - mimo-v2.5-tts-voicedesign (text-described voice)
 * 3. voiceclone  - mimo-v2.5-tts-voiceclone (audio sample cloning)
 *
 * Base URL: Token Plan uses cluster-specific URLs
 * Auth: Header "api-key: $MIMO_API_KEY"
 * Response audio at: choices[0].message.audio.data (base64)
 */
export class XiaomiTTSProvider implements TTSProvider {
  readonly name = 'xiaomi'
  private baseUrl: string
  private mode: string

  constructor() {
    if (!config.XIAOMI_TTS_API_KEY) {
      throw new Error('XIAOMI_TTS_API_KEY is not configured for TTS')
    }
    this.baseUrl = config.XIAOMI_TTS_BASE_URL ?? 'https://token-plan-cn.xiaomimimo.com/v1'
    this.mode = config.XIAOMI_TTS_MODE ?? 'preset'
    logger.info(
      { baseUrl: this.baseUrl, mode: this.mode },
      'Xiaomi MiMo TTS provider initialized',
    )
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer> {
    return getOrSynthesizeCachedAudio(text, options?.voiceDesign, async () => {
      const startTime = Date.now()
      const voiceDesign = options?.voiceDesign

      // voiceclone 模式：自动标定 —— 首次使用时用 voicedesign 生成参考样本，之后固定使用
      let effectiveMode = this.mode
      let cloneSource: string | undefined
      if (this.mode === 'voiceclone' && voiceDesign) {
        cloneSource = await this.ensureVoiceSample(voiceDesign)
      }

      logger.info(
        {
          provider: this.name,
          mode: effectiveMode,
          voice: options?.voice ?? config.XIAOMI_TTS_VOICE ?? 'Chloe',
          textLength: text.length,
          hasVoiceDesign: !!voiceDesign,
          voiceDesignPreview: voiceDesign?.slice(0, 60),
          usedCloneSample: !!cloneSource,
          textPreview: text.slice(0, 60),
        },
        '[Xiaomi TTS] synthesize request',
      )

      const body = await this.buildRequestBody(text, effectiveMode, options, cloneSource)

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.XIAOMI_TTS_API_KEY,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error')
        throw new Error(`Xiaomi TTS error: ${response.status} - ${errorText}`)
      }

      const result = (await response.json()) as XiaomiTTSResponse
      const audioBase64 = result.choices?.[0]?.message?.audio?.data

      if (!audioBase64) {
        throw new Error('Xiaomi TTS response missing audio data')
      }

      const buffer = Buffer.from(audioBase64, 'base64')
      const duration = Date.now() - startTime

      logger.info(
        { provider: this.name, mode: effectiveMode, duration, size: buffer.length },
        '[Xiaomi TTS] synthesize complete',
      )

      return buffer
    })
  }

  /**
   * 确保 voiceDesign 有对应的参考音频样本（voiceclone 模式自动标定）
   *
   * 首次使用某 voiceDesign 时，用 voicedesign 模型生成一段标准音色样本存盘；
   * 之后直接从磁盘读取，音色 100% 一致。
   */
  private async ensureVoiceSample(voiceDesign: string): Promise<string> {
    return getOrGenerateVoiceSample(voiceDesign, async () => {
      // 标定文本：一段中性英文句子，足够长以捕捉音色特征
      const calibrationText = "Hello! I'm your English tutor. Let's practice together today."

      const body = {
        model: 'mimo-v2.5-tts-voicedesign',
        messages: [
          { role: 'user' as const, content: voiceDesign },
          { role: 'assistant' as const, content: calibrationText },
        ],
        audio: { format: 'wav' as const },
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.XIAOMI_TTS_API_KEY,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error')
        throw new Error(`Voice sample calibration failed: ${response.status} - ${errorText}`)
      }

      const result = (await response.json()) as XiaomiTTSResponse
      const audioBase64 = result.choices?.[0]?.message?.audio?.data
      if (!audioBase64) {
        throw new Error('Voice sample calibration response missing audio data')
      }

      return Buffer.from(audioBase64, 'base64')
    })
  }

  async *synthesizeStream(
    text: string,
    options?: TTSSynthesizeOptions,
  ): AsyncGenerator<Buffer> {
    const voiceDesign = options?.voiceDesign

    // voiceclone 自动标定
    let effectiveMode = this.mode
    let cloneSource: string | undefined
    if (this.mode === 'voiceclone' && voiceDesign) {
      cloneSource = await this.ensureVoiceSample(voiceDesign)
    }

    logger.debug(
      { provider: this.name, mode: effectiveMode, textLength: text.length },
      'Xiaomi TTS stream request',
    )

    const body = await this.buildRequestBody(text, effectiveMode, options, cloneSource)
    ;(body as Record<string, unknown>).stream = true

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.XIAOMI_TTS_API_KEY,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => 'unknown error')
      throw new Error(`Xiaomi TTS stream error: ${response.status} - ${errorText}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const jsonStr = trimmed.slice(6)
          if (jsonStr === '[DONE]') continue

          try {
            const chunk = JSON.parse(jsonStr) as XiaomiTTSStreamChunk
            const audioData = chunk.choices?.[0]?.delta?.audio?.data
            if (audioData) {
              yield Buffer.from(audioData, 'base64')
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Build request body based on TTS mode
   *
   * @param cloneSource - pre-resolved base64 audio for voiceclone mode (from ensureVoiceSample)
   */
  private async buildRequestBody(
    text: string,
    mode: string,
    options?: TTSSynthesizeOptions,
    cloneSource?: string,
  ): Promise<unknown> {
    const voice = options?.voice ?? config.XIAOMI_TTS_VOICE ?? 'Chloe'
    const format = 'wav'

    switch (mode) {
      case 'voicedesign': {
        // Priority: dynamic voiceDesign from session > config default (慵懒御姐兜底)。
        // 用 || 而非 ??：避免 env 把 XIAOMI_TTS_VOICE_DESIGN 设成空串时漏到上游，
        // 触发小米「user message content must not be empty for voice design model」400。
        const designDesc =
          options?.voiceDesign ||
          config.XIAOMI_TTS_VOICE_DESIGN ||
          '成熟知性的御姐，声线低沉磁性、略带沙哑，慵懒从容，语速偏慢，句尾带轻气声'
        return {
          model: 'mimo-v2.5-tts-voicedesign',
          messages: [
            {
              role: 'user',
              content: designDesc,
            },
            {
              role: 'assistant',
              content: text,
            },
          ],
          audio: {
            format,
            // Note: voiceDesign mode does NOT support audio.voice
          },
        }
      }

      case 'voiceclone': {
        // cloneSource 来自自动标定（ensureVoiceSample），优先级高于静态配置
        const sample = cloneSource || config.XIAOMI_TTS_VOICE_CLONE || ''

        // voiceclone 模型要求 audio.voice 必须是参考音频的 DataURL。
        // 没有任何参考样本时（没传 voiceDesign 且没配 XIAOMI_TTS_VOICE_CLONE）
        // 无法做克隆 —— 退回 preset 模型用音色名兜底，避免 400。
        if (!sample) {
          logger.warn(
            { voice },
            '[Xiaomi TTS] voiceclone has no reference sample (missing voiceDesign) → falling back to preset model',
          )
          return {
            model: 'mimo-v2.5-tts',
            messages: [{ role: 'assistant', content: text }],
            audio: { format, voice },
          }
        }

        // 原始 base64 需补上 DataURL 前缀；已是 data: 开头则原样使用
        const voiceDataUrl = sample.startsWith('data:')
          ? sample
          : `data:audio/wav;base64,${sample}`

        return {
          model: 'mimo-v2.5-tts-voiceclone',
          messages: [
            {
              role: 'assistant',
              content: text,
            },
          ],
          audio: {
            format,
            voice: voiceDataUrl,
          },
        }
      }

      case 'preset':
      default: {
        return {
          model: 'mimo-v2.5-tts',
          messages: [
            {
              role: 'assistant',
              content: text,
            },
          ],
          audio: {
            format,
            voice,
          },
        }
      }
    }
  }
}

/** Non-streaming response */
interface XiaomiTTSResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string
      }
    }
  }>
}

/** Streaming chunk */
interface XiaomiTTSStreamChunk {
  choices?: Array<{
    delta?: {
      audio?: {
        data?: string
      }
    }
  }>
}
