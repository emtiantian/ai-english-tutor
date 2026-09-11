import { createServer } from './server.js'
import { config } from './config.js'
import { logger } from './logger.js'
import { checkCosyVoiceHealth } from './voice/tts-health.js'
import { closeDb } from './db/index.js'

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

    // CosyVoice 启动健康探测：
    // - 仅当 TTS_PROVIDER=cosyvoice 且开关开启时触发。
    // - **异步执行不阻塞启动**（void + .then，不 await）。
    // - **失败只 logger.warn，不抛错、不退出进程**：
    //   TTS 不可用时前端可降级到 browser TTS，后端不应因此启动失败。
    if (config.TTS_PROVIDER === 'cosyvoice' && config.COSYVOICE_HEALTH_CHECK) {
      void checkCosyVoiceHealth(config.COSYVOICE_BASE_URL, config.COSYVOICE_SPK_ID).then(result => {
        if (result.ok) {
          logger.info(
            {
              provider: 'cosyvoice',
              status: result.status,
              baseUrl: config.COSYVOICE_BASE_URL
            },
            'CosyVoice 健康探测通过'
          )
        } else {
          logger.warn(
            {
              provider: 'cosyvoice',
              error: result.error,
              baseUrl: config.COSYVOICE_BASE_URL
            },
            'CosyVoice 健康探测失败；TTS 不可用时前端可降级到 browser TTS，不阻塞后端运行。请检查 CosyVoice 容器是否已启动。'
          )
        }
      })
    }
  } catch (err) {
    logger.error({ err }, '启动服务器失败')
    process.exit(1)
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, '收到退出信号，正在停止接收请求并关闭数据库')

  try {
    await server?.close()
    closeDb()
    process.exit(0)
  } catch (err) {
    logger.error({ err, signal }, '服务关闭失败')
    process.exit(1)
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

main()
