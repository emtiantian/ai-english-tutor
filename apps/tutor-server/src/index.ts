import { createServer } from './server.js'
import { config } from './config.js'
import { logger } from './logger.js'

/**
 * 应用入口
 */
async function main(): Promise<void> {
  const server = await createServer()

  try {
    await server.listen({ port: config.PORT, host: '0.0.0.0' })
    logger.info(`服务器已启动，监听端口 ${config.PORT}`)
    logger.info(`运行环境：${config.NODE_ENV}`)
    logger.info(`日志级别：${config.LOG_LEVEL}`)
  } catch (err) {
    logger.error({ err }, '启动服务器失败')
    process.exit(1)
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  logger.info('收到 SIGINT，正在优雅关闭')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('收到 SIGTERM，正在优雅关闭')
  process.exit(0)
})

main()
