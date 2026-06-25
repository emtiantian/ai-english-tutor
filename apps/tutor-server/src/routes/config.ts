import type { FastifyInstance } from 'fastify'
import { getConfiguredASRProvider } from '../voice/asr.js'

export async function configRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/config', async (_request, reply) => {
    return reply.send({
      asrProvider: getConfiguredASRProvider(),
    })
  })
}
