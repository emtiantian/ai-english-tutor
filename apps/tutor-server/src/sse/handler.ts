import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { config, getTtsSource } from '../config.js'
import { logger } from '../logger.js'
import type { SSEEvent } from './types.js'

/** 将请求来源与 CORS 白名单匹配。不允许时返回 false。 */
export function resolveCorsOrigin(requestOrigin?: string): string | false {
  if (config.CORS_ORIGIN.includes('*')) return requestOrigin || '*'
  if (!requestOrigin) return config.CORS_ORIGIN[0] ?? '*'
  return config.CORS_ORIGIN.includes(requestOrigin) ? requestOrigin : false
}

/** 活跃的 SSE 连接，以 sessionId 为键 */
const connections = new Map<string, FastifyReply>()

/** 每个 sessionId 的断开监听器 */
const disconnectListeners = new Map<string, Set<() => void>>()

/**
 * 注册一个回调，当某 session 的 SSE 连接关闭时调用。
 * 返回取消订阅函数。
 */
export function onSessionDisconnect(sessionId: string, listener: () => void): () => void {
  let listeners = disconnectListeners.get(sessionId)
  if (!listeners) {
    listeners = new Set()
    disconnectListeners.set(sessionId, listeners)
  }
  listeners.add(listener)
  return () => {
    listeners?.delete(listener)
  }
}

function emitSessionDisconnect(sessionId: string): void {
  const listeners = disconnectListeners.get(sessionId)
  if (!listeners) return
  for (const listener of listeners) {
    try {
      listener()
    } catch (err) {
      logger.warn({ err, sessionId }, 'SSE 断开监听器失败')
    }
  }
  listeners.clear()
  disconnectListeners.delete(sessionId)
}

/**
 * 强制关闭原始响应 socket，忽略错误。
 */
function destroyRaw(reply: FastifyReply): void {
  try {
    reply.raw.destroy()
  } catch {
    // 忽略
  }
}

/**
 * 将 SSE 事件格式化为线路格式。
 */
function formatSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
}

/**
 * 在 Fastify 实例上注册 SSE 路由。
 */
export async function registerSSE(server: FastifyInstance): Promise<void> {
  server.get(
    '/api/chat/stream',
    async (
      request: FastifyRequest<{ Querystring: { sessionId?: string } }>,
      reply: FastifyReply
    ) => {
      const sessionId = (request.query as { sessionId?: string }).sessionId
      if (!sessionId) {
        reply.status(400).send({ error: '必须提供 sessionId 查询参数' })
        return
      }

      // 如果该 session 已有连接，先关闭它（标签页刷新 / 重连）
      const existing = connections.get(sessionId)
      if (existing) {
        try {
          existing.raw.end()
        } catch {
          /* 忽略 */
        }
        connections.delete(sessionId)
      }

      // 设置 SSE 响应头（为浏览器 EventSource 包含 CORS）
      // 遵循全局 CORS 策略：通配符来源不能发送凭据。
      const isWildcardCors = config.CORS_ORIGIN.includes('*')
      const allowOrigin = resolveCorsOrigin(request.headers.origin as string | undefined)
      const headers: Record<string, string> = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no' // 禁用 Nginx 缓冲
      }
      if (allowOrigin) {
        headers['Access-Control-Allow-Origin'] = allowOrigin
        if (!isWildcardCors) {
          headers['Access-Control-Allow-Credentials'] = 'true'
        }
      }
      reply.hijack()
      reply.raw.writeHead(200, headers)

      connections.set(sessionId, reply)
      logger.debug({ sessionId, totalConnections: connections.size }, 'SSE 连接已打开')

      // 将服务端配置作为第一个事件发送（在心跳之前）
      reply.raw.write(
        formatSSE({
          event: 'config',
          data: { ttsSource: getTtsSource() }
        })
      )

      // 发送初始心跳
      reply.raw.write(
        formatSSE({
          event: 'heartbeat',
          data: { timestamp: Date.now() }
        })
      )

      // 启动心跳间隔
      const heartbeatInterval = setInterval(() => {
        if (reply.raw.destroyed || reply.raw.writableEnded || !reply.raw.writable) {
          clearInterval(heartbeatInterval)
          if (connections.get(sessionId) === reply) {
            connections.delete(sessionId)
          }
          destroyRaw(reply)
          logger.debug({ sessionId }, 'SSE 心跳停止：连接已不可写')
          return
        }

        try {
          reply.raw.write(
            formatSSE({
              event: 'heartbeat',
              data: { timestamp: Date.now() }
            })
          )
        } catch (err) {
          clearInterval(heartbeatInterval)
          if (connections.get(sessionId) === reply) {
            connections.delete(sessionId)
          }
          destroyRaw(reply)
          logger.warn({ sessionId, err }, 'SSE 心跳失败，关闭连接')
        }
      }, config.SSE_HEARTBEAT_INTERVAL)

      // 检测半开 TCP 连接：若 3 个心跳内没有成功 I/O 则销毁 socket
      const socketTimeoutMs = Math.max(config.SSE_HEARTBEAT_INTERVAL * 3, 60000)
      request.raw.setTimeout(socketTimeoutMs, () => {
        logger.warn({ sessionId }, 'SSE 连接空闲超时，销毁连接')
        clearInterval(heartbeatInterval)
        if (connections.get(sessionId) === reply) {
          connections.delete(sessionId)
        }
        destroyRaw(reply)
      })

      // 处理客户端断开，并保持请求打开直到断开
      await new Promise<void>(resolve => {
        request.raw.on('close', () => {
          clearInterval(heartbeatInterval)
          request.raw.setTimeout(0) // 禁用空闲超时
          // 只有仍是我们的连接时才删除（避免被重连覆盖）
          if (connections.get(sessionId) === reply) {
            connections.delete(sessionId)
          }
          emitSessionDisconnect(sessionId)
          logger.debug({ sessionId, totalConnections: connections.size }, 'SSE 连接已关闭')
          resolve()
        })
      })
    }
  )
}

/**
 * 向指定 session 的 SSE 连接广播事件。
 * 这是主要的广播方法 —— 确保事件只到达拥有该 session 的设备/标签页。
 * 返回 true 表示事件已写入（或排队），false 表示该 session 没有有效连接。
 */
export function broadcastToSession(sessionId: string, event: SSEEvent): boolean {
  const reply = connections.get(sessionId)
  if (!reply) {
    logger.debug({ sessionId, event: event.event }, 'session 没有 SSE 连接，跳过广播')
    return false
  }

  if (reply.raw.destroyed || reply.raw.writableEnded || !reply.raw.writable) {
    logger.debug({ sessionId }, 'SSE 连接已不可写，移除')
    connections.delete(sessionId)
    destroyRaw(reply)
    return false
  }

  try {
    reply.raw.write(formatSSE(event))
    return true
  } catch (err) {
    logger.warn({ sessionId, err }, '向 session 广播失败')
    connections.delete(sessionId)
    destroyRaw(reply)
    return false
  }
}

/** 获取活跃连接数 */
export function getConnectionCount(): number {
  return connections.size
}
