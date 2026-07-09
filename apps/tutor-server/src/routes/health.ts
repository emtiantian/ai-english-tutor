import type { FastifyInstance } from 'fastify'

/**
 * 健康检查端点
 * GET /api/health
 */
export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/api/health', async () => {
    return { status: 'ok' }
  })
}
