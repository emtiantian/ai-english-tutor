import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { logger } from './logger.js'
import { registerRoutes } from './routes/index.js'
import { registerSSE } from './sse/handler.js'
import { initSchema } from './db/index.js'
import { loadAllVocabulary, loadAllScenarios } from './vocab/loader.js'

/**
 * 创建并配置 Fastify 服务器实例
 */
export async function createServer(): Promise<ReturnType<typeof Fastify>> {
  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL
    },
    bodyLimit: 1024 * 1024
  })

  // 注册 CORS
  const isWildcardCors = config.CORS_ORIGIN.includes('*')
  if (isWildcardCors) {
    logger.warn(
      { corsOrigin: config.CORS_ORIGIN },
      'CORS_ORIGIN 为通配符 (*)；凭据模式已禁用。生产环境请使用明确的白名单。'
    )
  }
  await server.register(cors, {
    origin: (origin, cb) => {
      if (isWildcardCors) {
        cb(null, true)
        return
      }
      if (!origin || config.CORS_ORIGIN.includes(origin)) {
        cb(null, true)
        return
      }
      cb(new Error('CORS 不允许该来源'), false)
    },
    credentials: !isWildcardCors
  })

  // 初始化数据库、词汇表和场景
  initSchema()
  loadAllVocabulary()
  loadAllScenarios()

  // 注册 API 路由
  await registerRoutes(server)

  // 注册 SSE 端点
  await registerSSE(server)

  // 全局错误处理器
  server.setErrorHandler((error: Error, _request, reply) => {
    logger.error({ err: error }, '未处理的错误')
    reply.status(500).send({
      error: error.message ?? '内部服务器错误',
      code: 'INTERNAL_ERROR'
    })
  })

  // 404 处理器
  server.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: '未找到',
      code: 'NOT_FOUND'
    })
  })

  return server
}
