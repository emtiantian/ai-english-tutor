import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { ASRProvider, ASRResult } from '../asr.js'

/**
 * Xiaomi MiMo-V2.5-ASR Provider
 *
 * Uses Xiaomi's speech recognition model via the OpenAI-compatible
 * chat completions endpoint. Audio is sent as `input_audio` content type
 * in data URL format.
 *
 * Endpoint: POST /v1/chat/completions
 * Model: mimo-v2.5-asr
 * Auth: api-key header
 */
export class XiaomiASRProvider implements ASRProvider {
  readonly name = 'xiaomi'
  private baseUrl: string
  private apiKey: string

  constructor() {
    if (!config.XIAOMI_ASR_API_KEY) {
      throw new Error('XIAOMI_ASR_API_KEY is not configured for ASR')
    }
    this.apiKey = config.XIAOMI_ASR_API_KEY
    this.baseUrl = config.XIAOMI_ASR_BASE_URL
  }

  async transcribe(audioBuffer: Buffer, mimeType?: string): Promise<ASRResult> {
    const mime = mimeType ?? 'audio/wav'
    const audioBase64 = audioBuffer.toString('base64')

    logger.info(
      { provider: this.name, size: audioBuffer.length, base64Size: audioBase64.length, mimeType: mime },
      '[Xiaomi ASR] Starting transcription...',
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
              input_audio: { data: dataUrl },
            },
          ],
        },
      ],
      ...(language ? { asr_options: { language } } : {}),
    }

    const url = `${this.baseUrl}/chat/completions`
    logger.info({ url, model: config.XIAOMI_ASR_MODEL, language }, '[Xiaomi ASR] Sending request...')

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error({ err: errMsg, url }, '[Xiaomi ASR] Connection failed')
      throw new Error(`Xiaomi ASR connection failed: ${errMsg}`)
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      logger.error({ status: response.status, errorText: errorText.slice(0, 300) }, '[Xiaomi ASR] Server returned error')
      throw new Error(`Xiaomi ASR error: ${response.status} - ${errorText}`)
    }

    const result = (await response.json()) as XiaomiASRResponse
    const text = result.choices?.[0]?.message?.content ?? ''
    const duration = Date.now() - startTime

    logger.info(
      { provider: this.name, duration, text: text.slice(0, 100), textLength: text.length },
      '[Xiaomi ASR] Transcription complete',
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
