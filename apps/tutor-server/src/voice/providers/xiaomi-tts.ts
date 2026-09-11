import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../tts.js'

interface XiaomiTTSResponse {
  choices?: Array<{ message?: { audio?: { data?: string } } }>
}

export class XiaomiTTSProvider implements TTSProvider {
  readonly name = 'xiaomi'
  readonly outputFormat = 'wav'

  constructor() {
    if (!config.XIAOMI_TTS_API_KEY) throw new Error('使用小米 TTS 必须配置 XIAOMI_TTS_API_KEY')
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer> {
    const body = this.buildRequest(text, options)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(`${config.XIAOMI_TTS_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': config.XIAOMI_TTS_API_KEY },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => 'unknown error')
        throw new Error(`小米 TTS 错误：${response.status} - ${detail}`)
      }
      const result = (await response.json()) as XiaomiTTSResponse
      const audio = result.choices?.[0]?.message?.audio?.data
      if (!audio) throw new Error('小米 TTS 响应缺少音频数据')
      return Buffer.from(audio, 'base64')
    } finally {
      clearTimeout(timeout)
    }
  }

  private buildRequest(text: string, options?: TTSSynthesizeOptions): unknown {
    if (config.XIAOMI_TTS_MODE === 'voicedesign') {
      const design = options?.voiceDesign || config.XIAOMI_TTS_VOICE_DESIGN
      if (!design) throw new Error('Voice Design 模式需要用户选择音色描述')
      logger.debug({ designPreview: design.slice(0, 60) }, '使用用户选择的 Voice Design')
      return {
        model: 'mimo-v2.5-tts-voicedesign',
        messages: [
          { role: 'user', content: design },
          { role: 'assistant', content: text }
        ],
        audio: { format: 'wav' }
      }
    }
    return {
      model: 'mimo-v2.5-tts',
      messages: [{ role: 'assistant', content: text }],
      audio: { format: 'wav', voice: options?.voice ?? config.XIAOMI_TTS_VOICE }
    }
  }
}
