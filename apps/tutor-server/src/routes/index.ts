import type { FastifyInstance } from 'fastify'
import { healthRoutes } from './health.js'
import { chatRoutes } from './chat.js'
import { voiceRoutes } from './voice.js'
import { vocabRoutes } from './vocab.js'
import { scenarioRoutes } from './scenarios.js'
import { configRoutes } from './config.js'

/**
 * 注册所有 API 路由
 */
export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(healthRoutes)
  await server.register(configRoutes)
  await server.register(chatRoutes)
  await server.register(voiceRoutes)
  await server.register(vocabRoutes)
  await server.register(scenarioRoutes)
}
