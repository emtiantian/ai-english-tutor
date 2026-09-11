import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/health', async () => {
    const llmReady =
      config.LLM_PROVIDER === 'mock' ||
      (config.LLM_PROVIDER === 'deepseek' && Boolean(config.DEEPSEEK_API_KEY))
    const ttsReady =
      config.TTS_PROVIDER === 'browser' ||
      (config.TTS_PROVIDER === 'xiaomi' && Boolean(config.XIAOMI_TTS_API_KEY))
    const asrReady = config.ASR_PROVIDER === 'browser'
    return {
      status: llmReady && ttsReady && asrReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        llm: { ok: llmReady, provider: config.LLM_PROVIDER },
        tts: { ok: ttsReady, provider: config.TTS_PROVIDER },
        asr: { ok: asrReady, provider: config.ASR_PROVIDER }
      }
    }
  })
}
