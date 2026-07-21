import pino from 'pino'
import { config } from './config.js'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'

/**
 * 应用日志实例
 * - 开发/测试环境：美化输出到 stdout
 * - 生产环境：JSON 输出同时写入 stdout 与 /app/data/logs/backend/app.log，
 *   便于日志聚合与宿主机持久化
 */
const prettyTransport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss Z',
    ignore: 'pid,hostname'
  }
})

function createProductionStreams(): { stream: pino.DestinationStream }[] {
  const logFilePath = join(config.DATA_DIR, 'logs', 'backend', 'app.log')
  try {
    mkdirSync(dirname(logFilePath), { recursive: true })
    const dest = pino.destination({
      dest: logFilePath,
      mkdir: true,
      sync: false
    })
    return [{ stream: process.stdout }, { stream: dest }]
  } catch {
    // 目录创建失败时回退到仅 stdout（常见于测试环境 DATA_DIR 未就绪）
    return [{ stream: process.stdout }]
  }
}

const streams =
  config.NODE_ENV === 'production' ? createProductionStreams() : [{ stream: prettyTransport }]

export const logger = pino({ level: config.LOG_LEVEL }, pino.multistream(streams))
