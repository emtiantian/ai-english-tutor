import http from 'node:http'
import type { FastifyInstance } from 'fastify'

export interface SSEvent {
  event?: string
  data: unknown
}

export async function createSSEServer(): Promise<{ server: FastifyInstance; port: number }> {
  const Fastify = (await import('fastify')).default
  const { registerSSE } = await import('@/sse/handler.js')

  const server = Fastify({ logger: false })
  await registerSSE(server)
  await server.listen({ port: 0 })

  const address = server.server.address()
  const port = typeof address === 'string' ? parseInt(address.split(':').pop()!, 10) : address!.port

  return { server, port }
}

export function collectSSE(
  url: string,
  options: { timeoutMs?: number; minEvents?: number } = {}
): Promise<{ events: SSEvent[]; req: http.ClientRequest }> {
  const { timeoutMs = 3000, minEvents = 0 } = options

  return new Promise((resolve, reject) => {
    const events: SSEvent[] = []
    const req = http.get(url, res => {
      let buffer = ''
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const lines = part.split('\n')
          let event: string | undefined
          let data = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7)
            else if (line.startsWith('data: ')) data = line.slice(6)
          }

          if (!data) continue

          try {
            events.push({ event, data: JSON.parse(data) })
          } catch {
            events.push({ event, data })
          }

          if (minEvents > 0 && events.length >= minEvents) {
            resolve({ events, req })
          }
        }
      })

      const timeout = setTimeout(() => resolve({ events, req }), timeoutMs)
      res.on('end', () => {
        clearTimeout(timeout)
        resolve({ events, req })
      })
    })

    req.on('error', reject)
  })
}
