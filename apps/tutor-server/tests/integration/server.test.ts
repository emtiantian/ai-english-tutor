import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

describe('server CORS', () => {
  const env = createTestEnv('server-cors')

  beforeAll(() => {
    env.setup({ CORS_ORIGIN: '*' })
  })

  afterAll(() => {
    env.cleanup()
  })

  it('allows wildcard origins without credentials', async () => {
    const { createServer } = await import('@/server.js')
    const server = await createServer()

    const wildcardRes = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example.com' },
    })

    expect(wildcardRes.headers['access-control-allow-origin']).toBeDefined()
    expect(wildcardRes.headers['access-control-allow-credentials']).not.toBe('true')

    await server.close()
  })

  it('reflects whitelisted origins and allows credentials', async () => {
    const { createServer } = await import('@/server.js')
    const { config: serverConfig } = await import('@/config.js')

    serverConfig.CORS_ORIGIN.length = 0
    serverConfig.CORS_ORIGIN.push('http://localhost:5173', 'http://localhost:4173')

    const server = await createServer()

    const allowedRes = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(allowedRes.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(allowedRes.headers['access-control-allow-credentials']).toBe('true')

    const blockedRes = await server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example.com' },
    })
    expect(blockedRes.headers['access-control-allow-origin']).not.toBe('http://evil.example.com')

    await server.close()
  })
})
