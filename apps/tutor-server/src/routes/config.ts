import type { FastifyInstance } from 'fastify'
import { getConfiguredASRProvider } from '../voice/asr.js'
import { config } from '../config.js'

export async function configRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/config', async (_request, reply) => {
    return reply.send({
      asrProvider: getConfiguredASRProvider(),
      ttsProvider: config.TTS_PROVIDER,
      // 只有小米 TTS 支持用 voiceDesign 配置音色；
      // 其它 provider（browser / cosyvoice / volcengine）下，风格下拉只作用于 LLM 人格，
      // 前端据此把标签切成「性格风格」。
      voiceStyleSelectable: config.TTS_PROVIDER === 'xiaomi'
    })
  })
}
