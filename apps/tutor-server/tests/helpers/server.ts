import type { FastifyInstance } from 'fastify'
import type { TestEnv } from './env'

export async function createTestServer(env?: TestEnv): Promise<FastifyInstance> {
  if (env) env.setup()
  const { createServer } = await import('@/server.js')
  return createServer()
}

export async function createTestApp(): Promise<FastifyInstance> {
  const Fastify = (await import('fastify')).default
  return Fastify({ logger: false })
}
