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

  it('allows five guest turns across scenario restarts and rejects the sixth', async () => {
    const { createServer } = await import('@/server.js')
    const server = await createServer()
    const sessionId = 'guest-limit-session'

    const start = await server.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        type: 'lesson.start',
        scenarioId: 'restaurant-ordering',
        sessionId,
        level: 2
      }
    })
    expect(start.statusCode).toBe(200)
    const cookie = start.headers['set-cookie']?.split(';')[0]
    expect(cookie).toContain('tutor_guest=')

    for (let turn = 1; turn <= 5; turn += 1) {
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        headers: { cookie: cookie ?? '' },
        payload: {
          type: 'user.speak',
          text: `Guest turn ${turn}`,
          sessionId,
          level: 2
        }
      })
      expect(response.statusCode).toBe(200)

      if (turn === 3) {
        const restart = await server.inject({
          method: 'POST',
          url: '/api/chat',
          headers: { cookie: cookie ?? '' },
          payload: {
            type: 'lesson.start',
            scenarioId: 'restaurant-ordering',
            sessionId,
            level: 2
          }
        })
        expect(restart.statusCode).toBe(200)
      }
    }

    const blocked = await server.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { cookie: cookie ?? '' },
      payload: {
        type: 'user.speak',
        text: 'One more turn',
        sessionId,
        level: 2
      }
    })

    expect(blocked.statusCode).toBe(401)
    expect(JSON.parse(blocked.body)).toEqual({
      code: 'AUTH_REQUIRED',
      message: '你已完成 5 轮免费英语练习，登录后可继续。',
      details: { used: 5, limit: 5 }
    })

    await server.close()
  })
})
