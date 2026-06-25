import { createServer } from './server.js'
import { config } from './config.js'
import { logger } from './logger.js'

/**
 * Application entry point
 */
async function main(): Promise<void> {
  const server = await createServer()

  try {
    await server.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info(`Server listening on port ${config.PORT}`)
    logger.info(`Environment: ${config.NODE_ENV}`)
    logger.info(`Log level: ${config.LOG_LEVEL}`)
  } catch (err) {
    logger.error({ err }, 'Failed to start server')
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully')
  process.exit(0)
})

main()
