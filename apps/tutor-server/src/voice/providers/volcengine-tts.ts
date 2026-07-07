import { randomUUID } from 'node:crypto'
import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../tts.js'
import { getOrSynthesizeCachedAudio } from '../tts-cache.js'

/**
 * Volcengine (火山引擎) 语音合成大模型 TTS Provider
 *
 * 用「单向 HTTP 一次性合成」接口（operation=query）：一次 POST，返回一个 JSON，
 * `data` 字段是整段 base64 音频，直接解码成 Buffer —— 与 TTSProvider 的
 * synthesize(text) → Buffer 接口天然契合。
 *
 * Endpoint:  https://openspeech.bytedance.com/api/v1/tts
 * Auth:      Header `Authorization: Bearer;{access_token}`
 *            注意是【分号】不是空格，这是火山特有写法，写错会 401。
 * Body:      { app:{appid,token,cluster}, user:{uid}, audio:{voice_type,encoding,speed_ratio}, request:{reqid,text,operation} }
 * Response:  { code: 3000, message: 'Success', data: '<base64 audio>', ... } —— code===3000 才算成功。
 *
 * 音色（voice_type）固定在服务端配置（VOLCENGINE_TTS_VOICE_TYPE），前端不可选；
 * 因此 options.voice / options.voiceDesign 都被忽略（大模型音色不吃文本音色描述）。
 *
 * 可选扩展：
 * - VOLCENGINE_TTS_MODEL       → 在请求体顶层加入 model 字段（如新模型版本）
 * - VOLCENGINE_TTS_RESOURCE_ID → 在请求体顶层加入 resource_id 字段（如 Seed-TTS 系列需要的 ResourceId）
 * 两者都为空时保持原接口行为不变，避免破坏旧音色。
 */
export class VolcengineTTSProvider implements TTSProvider {
  readonly name = 'volcengine'
  private baseUrl: string
  private appId: string
  private accessToken: string
  private cluster: string
  private voiceType: string
  private encoding: string
  private model: string
  private resourceId: string

  constructor() {
    if (!config.VOLCENGINE_TTS_APP_ID || !config.VOLCENGINE_TTS_ACCESS_TOKEN) {
      throw new Error(
        'VOLCENGINE_TTS_APP_ID and VOLCENGINE_TTS_ACCESS_TOKEN are required for Volcengine TTS',
      )
    }
    this.baseUrl = config.VOLCENGINE_TTS_BASE_URL
    this.appId = config.VOLCENGINE_TTS_APP_ID
    this.accessToken = config.VOLCENGINE_TTS_ACCESS_TOKEN
    this.cluster = config.VOLCENGINE_TTS_CLUSTER
    this.voiceType = config.VOLCENGINE_TTS_VOICE_TYPE
    this.encoding = config.VOLCENGINE_TTS_ENCODING
    this.model = config.VOLCENGINE_TTS_MODEL
    this.resourceId = config.VOLCENGINE_TTS_RESOURCE_ID
    logger.info(
      {
        baseUrl: this.baseUrl,
        cluster: this.cluster,
        voiceType: this.voiceType,
        encoding: this.encoding,
        model: this.model || undefined,
        resourceId: this.resourceId || undefined,
      },
      'Volcengine TTS provider initialized',
    )
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer> {
    // 音色固定，缓存键不掺 voiceDesign（火山忽略它），保证命中率
    return getOrSynthesizeCachedAudio(text, this.voiceType, async () => {
      const startTime = Date.now()
      const speed = options?.speed ?? config.TTS_SPEED

      logger.info(
        {
          provider: this.name,
          voiceType: this.voiceType,
          encoding: this.encoding,
          model: this.model || undefined,
          resourceId: this.resourceId || undefined,
          speed,
          textLength: text.length,
          textPreview: text.slice(0, 60),
        },
        '[Volcengine TTS] synthesize request',
      )

      const body: Record<string, unknown> = {
        app: {
          appid: this.appId,
          token: this.accessToken,
          cluster: this.cluster,
        },
        user: {
          uid: 'ai-english-tutor',
        },
        audio: {
          voice_type: this.voiceType,
          encoding: this.encoding,
          speed_ratio: speed,
        },
        request: {
          reqid: randomUUID(),
          text,
          operation: 'query',
        },
      }

      // 可选：携带模型版本 / ResourceId，支持 Seed-TTS 等新模型；为空时保持旧行为
      if (this.model) {
        body.model = this.model
      }
      if (this.resourceId) {
        body.resource_id = this.resourceId
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 火山特有：Bearer 后是【分号】不是空格
          Authorization: `Bearer;${this.accessToken}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error')
        throw new Error(`Volcengine TTS error: ${response.status} - ${errorText}`)
      }

      const result = (await response.json()) as VolcengineTTSResponse

      // 火山用 body 里的 code 报错（HTTP 仍是 200）：3000 = 成功
      if (result.code !== 3000 || !result.data) {
        throw new Error(
          `Volcengine TTS failed: code=${result.code} message=${result.message ?? 'no message'}`,
        )
      }

      const buffer = Buffer.from(result.data, 'base64')
      const duration = Date.now() - startTime

      logger.info(
        { provider: this.name, duration, size: buffer.length },
        '[Volcengine TTS] synthesize complete',
      )

      return buffer
    })
  }
}

/** Volcengine TTS HTTP 一次性合成响应 */
interface VolcengineTTSResponse {
  /** 3000 = 成功 */
  code?: number
  message?: string
  /** base64 编码的整段音频 */
  data?: string
}
