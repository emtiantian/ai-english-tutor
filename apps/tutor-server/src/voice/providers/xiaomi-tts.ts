import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../tts.js'
import { getOrSynthesizeCachedAudio } from '../tts-cache.js'
import { getOrGenerateVoiceSample } from '../voice-samples.js'

/** fetch 超时时间（毫秒） */
const FETCH_TIMEOUT_MS = 30_000

/**
 * 给 fetch 加超时：超过 timeoutMs 后中止请求并抛错。
 * 超时覆盖从发起到收到响应头的时间；响应体读取不受限。
 */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * 小米 MiMo TTS v2.5 Provider
 *
 * 支持三种模式：
 * 1. preset      - mimo-v2.5-tts（内置音色，支持唱歌）
 * 2. voicedesign - mimo-v2.5-tts-voicedesign（文本描述音色）
 * 3. voiceclone  - mimo-v2.5-tts-voiceclone（音频样本克隆）
 *
 * Base URL：Token Plan 使用集群专属 URL
 * 鉴权：Header "api-key: $MIMO_API_KEY"
 * 响应音频位置：choices[0].message.audio.data（base64）
 */
export class XiaomiTTSProvider implements TTSProvider {
  readonly name = 'xiaomi'
  // buildRequestBody 始终用 format='wav' 请求音频，故产出格式为 wav。
  readonly outputFormat = 'wav'
  private baseUrl: string
  private mode: string

  constructor() {
    if (!config.XIAOMI_TTS_API_KEY) {
      throw new Error('使用小米 TTS 必须配置 XIAOMI_TTS_API_KEY')
    }
    this.baseUrl = config.XIAOMI_TTS_BASE_URL ?? 'https://token-plan-cn.xiaomimimo.com/v1'
    this.mode = config.XIAOMI_TTS_MODE ?? 'preset'
    logger.info(
      { baseUrl: this.baseUrl, mode: this.mode },
      '小米 MiMo TTS 提供商初始化完成',
    )
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer> {
    const voice = options?.voice ?? config.XIAOMI_TTS_VOICE ?? 'Chloe'
    return getOrSynthesizeCachedAudio(
      text,
      { voice, mode: this.mode, voiceDesign: options?.voiceDesign },
      async () => {
        const startTime = Date.now()
        const voiceDesign = options?.voiceDesign

        // voiceclone 模式：自动标定 -- 首次使用时用 voicedesign 生成参考样本，之后固定使用
        let effectiveMode = this.mode
        let cloneSource: string | undefined
        if (this.mode === 'voiceclone' && voiceDesign) {
          cloneSource = await this.ensureVoiceSample(voiceDesign)
        }

        logger.info(
          {
            provider: this.name,
            mode: effectiveMode,
            voice,
            textLength: text.length,
            hasVoiceDesign: !!voiceDesign,
            voiceDesignPreview: voiceDesign?.slice(0, 60),
            usedCloneSample: !!cloneSource,
            textPreview: text.slice(0, 60),
          },
          '[小米 TTS] 合成请求',
        )

        const body = await this.buildRequestBody(text, effectiveMode, options, cloneSource)

        const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': config.XIAOMI_TTS_API_KEY,
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown error')
          throw new Error(`小米 TTS 错误：${response.status} - ${errorText}`)
        }

        const result = (await response.json()) as XiaomiTTSResponse
        const audioBase64 = result.choices?.[0]?.message?.audio?.data

        if (!audioBase64) {
            throw new Error('小米 TTS 响应缺少音频数据')
        }

        const buffer = Buffer.from(audioBase64, 'base64')
        const duration = Date.now() - startTime

        logger.info(
          { provider: this.name, mode: effectiveMode, duration, size: buffer.length },
          '[小米 TTS] 合成完成',
        )

        return buffer
      },
    )
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

      const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': config.XIAOMI_TTS_API_KEY,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error')
        throw new Error(`音色样本标定失败：${response.status} - ${errorText}`)
      }

      const result = (await response.json()) as XiaomiTTSResponse
      const audioBase64 = result.choices?.[0]?.message?.audio?.data
      if (!audioBase64) {
        throw new Error('音色样本标定响应缺少音频数据')
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
      '小米 TTS 流式请求',
    )

    const body = await this.buildRequestBody(text, effectiveMode, options, cloneSource)
    ;(body as Record<string, unknown>).stream = true

    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.XIAOMI_TTS_API_KEY,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => 'unknown error')
      throw new Error(`小米 TTS 流式错误：${response.status} - ${errorText}`)
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
            // 跳过格式错误的 JSON 行
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 根据 TTS 模式构建请求体
   *
   * @param cloneSource - voiceclone 模式使用的预解析 base64 音频（来自 ensureVoiceSample）
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
        // 优先级：session 中的动态 voiceDesign > config 默认（慵懒御姐兜底）。
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
            // 注意：voiceDesign 模式不支持 audio.voice
          },
        }
      }

      case 'voiceclone': {
        // cloneSource 来自自动标定（ensureVoiceSample），优先级高于静态配置
        const sample = cloneSource || config.XIAOMI_TTS_VOICE_CLONE || ''

        // voiceclone 模型要求 audio.voice 必须是参考音频的 DataURL。
        // 没有任何参考样本时（没传 voiceDesign 且没配 XIAOMI_TTS_VOICE_CLONE）
        // 无法做克隆 -- 退回 preset 模型用音色名兜底，避免 400。
        if (!sample) {
          logger.warn(
            { voice },
            '[小米 TTS] voiceclone 缺少参考样本（未提供 voiceDesign），回退到 preset 模型',
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

/** 非流式响应 */
interface XiaomiTTSResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string
      }
    }
  }>
}

/** 流式分块 */
interface XiaomiTTSStreamChunk {
  choices?: Array<{
    delta?: {
      audio?: {
        data?: string
      }
    }
  }>
}
