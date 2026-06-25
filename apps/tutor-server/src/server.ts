import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { config } from './config.js'
import { logger } from './logger.js'
import { registerRoutes } from './routes/index.js'
import { registerSSE } from './sse/handler.js'
import { initSchema } from './db/index.js'
import { loadAllVocabulary, loadAllScenarios } from './vocab/loader.js'

/**
 * Create and configure the Fastify server instance
 */
export async function createServer(): Promise<ReturnType<typeof Fastify>> {
  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
    },
    // WAV audio from ASR can be large (uncompressed), increase body limit to 25MB
    bodyLimit: 25 * 1024 * 1024,
  })

  // Register CORS
  const isWildcardCors = config.CORS_ORIGIN.includes('*')
  if (isWildcardCors) {
    logger.warn(
      { corsOrigin: config.CORS_ORIGIN },
      'CORS_ORIGIN is a wildcard (*); credentials are disabled. Use an explicit whitelist in production.',
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
      cb(new Error('Not allowed by CORS'), false)
    },
    credentials: !isWildcardCors,
  })

  // Register multipart for file uploads (ASR audio)
  await server.register(multipart, {
    limits: {
      fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024,
    },
  })

  // Initialize database, vocabulary, and scenarios
  initSchema()
  loadAllVocabulary()
  loadAllScenarios()

  // Register API routes
  await registerRoutes(server)

  // Register SSE endpoint
  await registerSSE(server)

  // Global error handler
  server.setErrorHandler((error: Error, _request, reply) => {
    logger.error({ err: error }, 'Unhandled error')
    reply.status(500).send({
      error: error.message ?? 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  })

  // 404 handler
  server.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: 'Not found',
      code: 'NOT_FOUND',
    })
  })

  return server
}
