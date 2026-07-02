import type { FastifyInstance } from 'fastify'
import { getConfiguredASRProvider } from '../voice/asr.js'
import { config } from '../config.js'

export async function configRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/config', async (_request, reply) => {
    return reply.send({
      asrProvider: getConfiguredASRProvider(),
      // 火山大模型 TTS 用固定 voice_type，忽略语音风格里的音色(voiceDesign)；
      // 此时风格下拉仍保留(只作用于 LLM 人格)，前端据此把标签切成「性格风格」。
      voiceStyleSelectable: config.TTS_PROVIDER !== 'volcengine',
    })
  })
}
