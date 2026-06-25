import type { FastifyInstance } from 'fastify'

/**
 * Health check endpoint
 * GET /api/health
 */
export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/health', async () => {
    return { status: 'ok' }
  })
}
