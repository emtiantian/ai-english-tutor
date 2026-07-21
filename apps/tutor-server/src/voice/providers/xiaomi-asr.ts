import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { ASRProvider, ASRResult } from '../asr.js'

/**
 * 小米 MiMo-V2.5-ASR Provider
 *
 * 通过兼容 OpenAI 的 chat completions 接口使用小米语音识别模型。
 * 音频以 `input_audio` 内容类型、data URL 格式发送。
 *
 * 接口：POST /v1/chat/completions
 * 模型：mimo-v2.5-asr
 * 鉴权：api-key header
 */
export class XiaomiASRProvider implements ASRProvider {
  readonly name = 'xiaomi'
  private baseUrl: string
  private apiKey: string

  constructor() {
    if (!config.XIAOMI_ASR_API_KEY) {
      throw new Error('使用小米 ASR 必须配置 XIAOMI_ASR_API_KEY')
    }
    this.apiKey = config.XIAOMI_ASR_API_KEY
    this.baseUrl = config.XIAOMI_ASR_BASE_URL
  }

  async transcribe(audioBuffer: Buffer, mimeType?: string): Promise<ASRResult> {
    const mime = mimeType ?? 'audio/wav'
    const audioBase64 = audioBuffer.toString('base64')

    logger.info(
      {
        provider: this.name,
        size: audioBuffer.length,
        base64Size: audioBase64.length,
        mimeType: mime
      },
      '[小米 ASR] 开始转写...'
    )

    const startTime = Date.now()
    const dataUrl = `data:${mime};base64,${audioBase64}`

    const language = config.ASR_LANGUAGE === 'auto' ? undefined : config.ASR_LANGUAGE

    const body = {
      model: config.XIAOMI_ASR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: dataUrl }
            }
          ]
        }
      ],
      ...(language ? { asr_options: { language } } : {})
    }

    const url = `${this.baseUrl}/chat/completions`
    logger.info({ url, model: config.XIAOMI_ASR_MODEL, language }, '[小米 ASR] 发送请求...')

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(body)
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error({ err: errMsg, url }, '[小米 ASR] 连接失败')
      throw new Error(`小米 ASR 连接失败：${errMsg}`, { cause: err })
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      logger.error(
        { status: response.status, errorText: errorText.slice(0, 300) },
        '[小米 ASR] 服务器返回错误'
      )
      throw new Error(`小米 ASR 错误：${response.status} - ${errorText}`)
    }

    const result = (await response.json()) as XiaomiASRResponse
    const text = result.choices?.[0]?.message?.content ?? ''
    const duration = Date.now() - startTime

    logger.info(
      { provider: this.name, duration, text: text.slice(0, 100), textLength: text.length },
      '[小米 ASR] 转写完成'
    )

    return { text }
  }
}

interface XiaomiASRResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}
