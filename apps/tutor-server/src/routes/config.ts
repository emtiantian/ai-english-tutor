import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'

export async function configRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/config', async (_request, reply) => {
    return reply.send({
      asrProvider: config.ASR_PROVIDER,
      ttsProvider: config.TTS_PROVIDER,
      // Voice Design is a user voice preference and never comes from the scenario.
      voiceStyleSelectable: config.TTS_PROVIDER === 'xiaomi'
    })
  })
}
