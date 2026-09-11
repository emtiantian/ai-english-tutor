import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { createTestEnv } from '@tests/helpers/env.js'

describe('voice routes', () => {
  const env = createTestEnv('voice-routes')
  beforeAll(() => env.setup())
  afterAll(() => env.cleanup())

  it('rejects TTS with empty text', async () => {
    const { voiceRoutes } = await import('@/routes/voice.js')
    const app = Fastify({ logger: false })
    await app.register(voiceRoutes)
    const response = await app.inject({ method: 'POST', url: '/api/tts', payload: { text: '   ' } })
    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).code).toBe('MISSING_TEXT')
    await app.close()
  })

  it('does not expose a server ASR endpoint', async () => {
    const { voiceRoutes } = await import('@/routes/voice.js')
    const app = Fastify({ logger: false })
    await app.register(voiceRoutes)
    const response = await app.inject({ method: 'POST', url: '/api/asr' })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})
