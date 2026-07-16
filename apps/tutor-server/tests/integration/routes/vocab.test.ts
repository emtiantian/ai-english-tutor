import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { createTestEnv } from '@tests/helpers/env.js'

describe('vocab routes', () => {
  const env = createTestEnv('vocab-routes')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('syncs vocabulary words', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { vocabRoutes } = await import('@/routes/vocab.js')
    const { vocabRepo } = await import('@/db/repositories/vocabulary.js')

    initSchema()

    const app = Fastify()
    await app.register(vocabRoutes)

    const userId = 'test-user-001'
    const response = await app.inject({
      method: 'POST',
      url: '/api/vocab/sync',
      payload: {
        userId,
        words: [
          { word: 'coffee', action: 'learn', timestamp: Date.now() },
          { word: 'tea', action: 'learn', timestamp: Date.now() },
        ],
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body.success).toBe(true)
    expect(body.synced).toBe(2)

    const words = vocabRepo.getAllWords(userId).map((r) => r.word)
    expect(words).toContain('coffee')
    expect(words).toContain('tea')

    await app.close()
  })
})
