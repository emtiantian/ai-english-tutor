import pino from 'pino'
import { config } from './config.js'
import { join, dirname } from 'path'
import { appendFileSync, mkdirSync, statSync, renameSync, existsSync } from 'fs'
import { Writable } from 'stream'

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

function createContentStream(): pino.DestinationStream | undefined {
  if (!config.LOG_CONTENT_ENABLED) return undefined
  const filePath = join(config.DATA_DIR, 'logs', 'backend', 'llm-content.log')
  mkdirSync(dirname(filePath), { recursive: true })
  const maxBytes = Math.max(1, config.LOG_CONTENT_FILE_MAX_MB) * 1024 * 1024
  const maxFiles = Math.max(1, config.LOG_CONTENT_MAX_FILES)
  let size = existsSync(filePath) ? statSync(filePath).size : 0
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      try {
        if (size + chunk.length > maxBytes) {
          for (let index = maxFiles - 1; index >= 1; index--) {
            const source = `${filePath}.${index}`
            const target = `${filePath}.${index + 1}`
            if (existsSync(source)) renameSync(source, target)
          }
          if (existsSync(filePath)) renameSync(filePath, `${filePath}.1`)
          size = 0
        }
        appendFileSync(filePath, chunk)
        size += chunk.length
        callback()
      } catch (error) {
        callback(error as Error)
      }
    }
  })
  return output
}

const streams =
  config.NODE_ENV === 'production' ? createProductionStreams() : [{ stream: prettyTransport }]

export const logger = pino({ level: config.LOG_LEVEL }, pino.multistream(streams))
const contentStream = config.NODE_ENV === 'production' ? createContentStream() : undefined
export const contentLogger = contentStream ? pino({ level: 'info' }, contentStream) : undefined
