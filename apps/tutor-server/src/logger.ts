import pino from 'pino'
import { config } from './config.js'

/**
 * 应用日志实例
 * - 开发环境：美化输出
 * - 生产环境：JSON 输出，便于日志聚合
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
})
