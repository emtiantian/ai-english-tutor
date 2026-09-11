import { createServer } from './server.js'
import { config } from './config.js'
import { logger } from './logger.js'

let server: Awaited<ReturnType<typeof createServer>> | undefined
let shuttingDown = false

/**
 * 应用入口
 */
async function main(): Promise<void> {
  server = await createServer()

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

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, '收到退出信号，正在停止接收请求')

  try {
    await server?.close()
    process.exit(0)
  } catch (err) {
    logger.error({ err, signal }, '服务关闭失败')
    process.exit(1)
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

main()
