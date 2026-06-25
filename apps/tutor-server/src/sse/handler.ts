import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { config, getTtsSource } from '../config.js'
import { logger } from '../logger.js'
import type { SSEEvent } from './types.js'

/** Match request origin against CORS whitelist. Returns `false` when disallowed. */
export function resolveCorsOrigin(requestOrigin?: string): string | false {
  if (config.CORS_ORIGIN.includes('*')) return requestOrigin || '*'
  if (!requestOrigin) return config.CORS_ORIGIN[0] ?? '*'
  return config.CORS_ORIGIN.includes(requestOrigin) ? requestOrigin : false
}

/** Active SSE connections, keyed by sessionId */
const connections = new Map<string, FastifyReply>()

/** Disconnect listeners per sessionId */
const disconnectListeners = new Map<string, Set<() => void>>()

/**
 * Register a callback to be invoked when the SSE connection for a session closes.
 * Returns an unsubscribe function.
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
      logger.warn({ err, sessionId }, 'SSE disconnect listener failed')
    }
  }
  listeners.clear()
  disconnectListeners.delete(sessionId)
}

/**
 * Forcefully close a raw response socket, ignoring errors.
 */
function destroyRaw(reply: FastifyReply): void {
  try {
    reply.raw.destroy()
  } catch {
    // ignore
  }
}

/**
 * Format an SSE event into the wire format
 */
function formatSSE(event: SSEEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
}

/**
 * Register SSE routes on the Fastify instance
 */
export async function registerSSE(server: FastifyInstance): Promise<void> {
  server.get('/api/chat/stream', async (request: FastifyRequest<{ Querystring: { sessionId?: string } }>, reply: FastifyReply) => {
    const sessionId = (request.query as { sessionId?: string }).sessionId
    if (!sessionId) {
      reply.status(400).send({ error: 'sessionId query parameter is required' })
      return
    }

    // If there's already a connection for this session, close it (tab refresh / reconnect)
    const existing = connections.get(sessionId)
    if (existing) {
      try { existing.raw.end() } catch { /* ignore */ }
      connections.delete(sessionId)
    }

    // Set SSE headers (include CORS for browser EventSource)
    // Mirror the global CORS policy: wildcard origins must NOT send credentials.
    const isWildcardCors = config.CORS_ORIGIN.includes('*')
    const allowOrigin = resolveCorsOrigin(request.headers.origin as string | undefined)
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
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
    logger.debug({ sessionId, totalConnections: connections.size }, 'SSE connection opened')

    // Send server config as first event (before heartbeat)
    reply.raw.write(
      formatSSE({
        event: 'config',
        data: { ttsSource: getTtsSource() },
      }),
    )

    // Send initial heartbeat
    reply.raw.write(
      formatSSE({
        event: 'heartbeat',
        data: { timestamp: Date.now() },
      }),
    )

    // Start heartbeat interval
    const heartbeatInterval = setInterval(() => {
      if (reply.raw.destroyed || reply.raw.writableEnded || !reply.raw.writable) {
        clearInterval(heartbeatInterval)
        if (connections.get(sessionId) === reply) {
          connections.delete(sessionId)
        }
        destroyRaw(reply)
        logger.debug({ sessionId }, 'SSE heartbeat stopped: connection no longer writable')
        return
      }

      try {
        reply.raw.write(
          formatSSE({
            event: 'heartbeat',
            data: { timestamp: Date.now() },
          }),
        )
      } catch (err) {
        clearInterval(heartbeatInterval)
        if (connections.get(sessionId) === reply) {
          connections.delete(sessionId)
        }
        destroyRaw(reply)
        logger.warn({ sessionId, err }, 'SSE heartbeat failed, closing connection')
      }
    }, config.SSE_HEARTBEAT_INTERVAL)

    // Detect half-open TCP connections: destroy socket if no successful I/O for 3 heartbeats
    const socketTimeoutMs = Math.max(config.SSE_HEARTBEAT_INTERVAL * 3, 60000)
    request.raw.setTimeout(socketTimeoutMs, () => {
      logger.warn({ sessionId }, 'SSE socket idle timeout, destroying connection')
      clearInterval(heartbeatInterval)
      if (connections.get(sessionId) === reply) {
        connections.delete(sessionId)
      }
      destroyRaw(reply)
    })

    // Handle client disconnect and keep the request open until then
    await new Promise<void>((resolve) => {
      request.raw.on('close', () => {
        clearInterval(heartbeatInterval)
        request.raw.setTimeout(0) // disable the idle timeout
        // Only delete if it's still our connection (not replaced by a reconnect)
        if (connections.get(sessionId) === reply) {
          connections.delete(sessionId)
        }
        emitSessionDisconnect(sessionId)
        logger.debug({ sessionId, totalConnections: connections.size }, 'SSE connection closed')
        resolve()
      })
    })
  })
}

/**
 * Broadcast an event to the SSE connection for a specific session.
 * This is the primary broadcast method — ensures events only reach
 * the device/tab that owns the session.
 * Returns true if the event was written (or queued), false if the session has no valid connection.
 */
export function broadcastToSession(sessionId: string, event: SSEEvent): boolean {
  const reply = connections.get(sessionId)
  if (!reply) {
    logger.debug({ sessionId, event: event.event }, 'No SSE connection for session, skipping broadcast')
    return false
  }

  if (reply.raw.destroyed || reply.raw.writableEnded || !reply.raw.writable) {
    logger.debug({ sessionId }, 'SSE connection is no longer writable, removing')
    connections.delete(sessionId)
    destroyRaw(reply)
    return false
  }

  try {
    reply.raw.write(formatSSE(event))
    return true
  } catch (err) {
    logger.warn({ sessionId, err }, 'Failed to broadcast to session')
    connections.delete(sessionId)
    destroyRaw(reply)
    return false
  }
}

/**
 * @deprecated Use broadcastToSession() instead.
 * Kept only for backward compatibility — sends to ALL connections.
 */
export function broadcast(event: SSEEvent): void {
  logger.warn({ event: event.event }, 'broadcast() called without sessionId — use broadcastToSession() instead')
  const payload = formatSSE(event)
  for (const [id, reply] of connections) {
    if (reply.raw.destroyed || reply.raw.writableEnded || !reply.raw.writable) {
      connections.delete(id)
      destroyRaw(reply)
      continue
    }

    try {
      reply.raw.write(payload)
    } catch (err) {
      logger.warn({ sessionId: id, err }, 'Failed to broadcast to connection')
      connections.delete(id)
      destroyRaw(reply)
    }
  }
}

/** Get the number of active connections */
export function getConnectionCount(): number {
  return connections.size
}
