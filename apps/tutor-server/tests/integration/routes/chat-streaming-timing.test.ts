import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'
import type { LLMProvider, LLMResponse, ProviderCapabilities } from '@/ai/llm/types.js'

class SlowStreamProvider implements LLMProvider {
  readonly name = 'slow-stream-mock'
  readonly capabilities: ProviderCapabilities = {
    supportsAudioInput: false,
    supportsStreaming: true
  }

  async complete(): Promise<LLMResponse> {
    return {
      content: JSON.stringify({
        text: 'slow response',
        motionId: 'wave',
        expressionId: 'happy',
        vocabulary: ['slow']
      })
    }
  }

  async *stream(): AsyncGenerator<{ content: string; isEnd: boolean }> {
    await new Promise(resolve => setTimeout(resolve, 2000))
    yield { content: 'slow', isEnd: false }
    yield { content: '', isEnd: true }
  }
}

describe('chat streaming timing', () => {
  const env = createTestEnv('chat-streaming-timing')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('returns 202 before slow LLM completes', async () => {
    const { createServer } = await import('@/server.js')
    const { tutorEngine } = await import('@/ai/engine.js')

    const originalLlm = (tutorEngine as any).llm
    ;(tutorEngine as any).llm = new SlowStreamProvider()

    const server = await createServer()

    try {
      const start = Date.now()
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          type: 'user.speak',
          text: 'hello',
          stream: true,
          sessionId: 'stream-timing-session',
          level: 2,
          userId: 'stream-timing-user'
        }
      })
      const elapsed = Date.now() - start

      expect(response.statusCode).toBe(202)
      const body = JSON.parse(response.body)
      expect(body.accepted).toBe(true)
      expect(elapsed).toBeLessThan(1000)
    } finally {
      ;(tutorEngine as any).llm = originalLlm
      await server.close()
    }
  })
})
