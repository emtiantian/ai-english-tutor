import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

describe('health route', () => {
  const env = createTestEnv('health-route')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('returns structured health checks', async () => {
    const { createServer } = await import('@/server.js')
    const server = await createServer()

    const response = await server.inject({
      method: 'GET',
      url: '/api/health'
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.status).toMatch(/^(ok|degraded)$/)
    expect(body.timestamp).toBeDefined()
    expect(body.checks).toBeDefined()
    expect(body.checks.database).toBeDefined()
    expect(body.checks.database.ok).toBe(true)
    expect(body.checks.migrations).toBeDefined()
    expect(body.checks.migrations.ok).toBe(true)
    expect(body.checks.llm).toBeDefined()
    expect(body.checks.llm.provider).toBeDefined()
    expect(body.checks.tts).toBeDefined()
    expect(body.checks.tts.provider).toBeDefined()
    expect(body.checks.asr).toBeDefined()
    expect(body.checks.asr.provider).toBeDefined()
    expect(body.checks.disk).toBeDefined()
    expect(typeof body.checks.disk.freePercent).toBe('number')

    await server.close()
  })
})
