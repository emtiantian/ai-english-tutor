import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../tts.js'
import { getOrSynthesizeCachedAudio } from '../tts-cache.js'

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
 * Volcengine Ark Agent Plan 语音合成 TTS Provider
 *
 * 使用 HTTP 单向流式接口：
 *   POST https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional
 *
 * 鉴权：
 *   X-Api-Key: {专属 API Key}
 *   X-Api-Resource-Id: seed-tts-2.0
 *
 * 请求体：
 *   { req_params: { text, speaker, audio_params: { format, sample_rate } } }
 *
 * 响应：HTTP Chunked，每行一个 JSON：
 *   - code === 0           → data 字段为 base64 音频片段
 *   - code === 20000000    → 合成结束
 *   - code > 0            → 错误
 */
export class VolcengineTTSProvider implements TTSProvider {
  readonly name = 'volcengine'
  private baseUrl: string
  private apiKey: string
  private resourceId: string
  private speaker: string
  private format: string
  private sampleRate: number

  constructor() {
    if (!config.VOLCENGINE_TTS_API_KEY) {
      throw new Error('使用火山方舟 TTS 必须配置 VOLCENGINE_TTS_API_KEY')
    }
    this.baseUrl = config.VOLCENGINE_TTS_BASE_URL
    this.apiKey = config.VOLCENGINE_TTS_API_KEY
    this.resourceId = config.VOLCENGINE_TTS_RESOURCE_ID
    this.speaker = config.VOLCENGINE_TTS_SPEAKER
    this.format = config.VOLCENGINE_TTS_FORMAT
    this.sampleRate = config.VOLCENGINE_TTS_SAMPLE_RATE
    logger.info(
      {
        baseUrl: this.baseUrl,
        resourceId: this.resourceId,
        speaker: this.speaker,
        format: this.format,
        sampleRate: this.sampleRate,
      },
      '火山方舟 TTS 提供商初始化完成',
    )
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer> {
    const speed = options?.speed ?? config.TTS_SPEED
    return getOrSynthesizeCachedAudio(
      text,
      { voice: this.speaker, format: this.format, speed },
      async () => {
        const startTime = Date.now()

        logger.info(
          {
            provider: this.name,
            resourceId: this.resourceId,
            speaker: this.speaker,
            format: this.format,
            sampleRate: this.sampleRate,
            speed,
            textLength: text.length,
            textPreview: text.slice(0, 60),
          },
          '[火山 TTS] 合成请求',
        )

        const body = {
          req_params: {
            text,
            speaker: this.speaker,
            audio_params: {
              format: this.format,
              sample_rate: this.sampleRate,
              // 通过 speed 控制语速（若接口支持；否则仅作日志）
              ...(speed !== 1 ? { speed } : {}),
            },
          },
        }

        const response = await fetchWithTimeout(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive',
            'X-Api-Key': this.apiKey,
            'X-Api-Resource-Id': this.resourceId,
            'X-Api-Connect-Id': randomUUID(),
            'X-Control-Require-Usage-Tokens-Return': '*',
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'unknown error')
          throw new Error(`火山 TTS 错误：${response.status} - ${errorText}`)
        }

        if (!response.body) {
          throw new Error('火山 TTS 响应体为空')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        const audioChunks: Buffer[] = []
        let buffer = ''
        let totalSize = 0
        let finished = false

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue

              let chunk: VolcengineTTSChunk
              try {
                chunk = JSON.parse(trimmed) as VolcengineTTSChunk
              } catch {
                logger.warn({ line: trimmed.slice(0, 200) }, '[火山 TTS] 跳过格式错误的 JSON 行')
                continue
              }

              if (chunk.code === 20000000) {
                finished = true
                continue
              }

              if (chunk.code !== 0) {
                throw new Error(
                  `火山 TTS 失败：code=${chunk.code} message=${chunk.message ?? '无消息'}`,
                )
              }

              if (chunk.data) {
                const audio = Buffer.from(chunk.data, 'base64')
                audioChunks.push(audio)
                totalSize += audio.length
              }
            }
          }
        } finally {
          reader.releaseLock()
        }

        if (!finished && audioChunks.length === 0) {
          throw new Error('火山 TTS 未返回音频且没有结束信号')
        }

        const result = Buffer.concat(audioChunks)
        const duration = Date.now() - startTime

        logger.info(
          { provider: this.name, duration, size: result.length, chunks: audioChunks.length },
          '[火山 TTS] 合成完成',
        )

        return result
      },
    )
  }
}

interface VolcengineTTSChunk {
  code?: number
  message?: string
  data?: string
}
