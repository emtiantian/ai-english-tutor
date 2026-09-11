import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

describe('chat routes stream mode', () => {
  const env = createTestEnv('chat-routes')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('returns 202 for stream mode without assistant text', async () => {
    const { createServer } = await import('@/server.js')
    const server = await createServer()

    const response = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        type: 'user.speak',
        text: 'hello',
        stream: true,
        sessionId: 'stream-test-session',
        level: 2,
        userId: 'stream-test-user'
      }
    })

    expect(response.statusCode).toBe(202)
    const body = JSON.parse(response.body)
    expect(body.accepted).toBe(true)
    expect(body.text).toBeUndefined()

    await server.close()
  })

  it('rejects invalid text and empty user input as 400', async () => {
    const { createServer } = await import('@/server.js')
    const server = await createServer()

    const invalidText = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { type: 'user.speak', text: 123, sessionId: 'validation-session' }
    })
    expect(invalidText.statusCode).toBe(400)
    expect(JSON.parse(invalidText.body).code).toBe('INVALID_TEXT')

    const emptyInput = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { type: 'user.speak', text: '   ', sessionId: 'validation-session' }
    })
    expect(emptyInput.statusCode).toBe(400)
    expect(JSON.parse(emptyInput.body).code).toBe('MISSING_INPUT')

    await server.close()
  })
})
