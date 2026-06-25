import pino from 'pino'
import { config } from './config.js'

/**
 * Application logger instance
 * - Development: pretty-printed output
 * - Production: JSON output for log aggregation
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
