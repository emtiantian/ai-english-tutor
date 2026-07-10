import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-stream-timing-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')
process.env.LLM_PROVIDER = 'mock'
process.env.TTS_PROVIDER = 'browser'
process.env.ASR_PROVIDER = 'browser'
process.env.CORS_ORIGIN = '*'

const { createServer } = await import('../server.js')
const { tutorEngine } = await import('../ai/engine.js')

import type { LLMProvider, LLMResponse, ProviderCapabilities } from '../ai/llm/types.js'

/**
 * 一个流式方法足够慢的 provider，用来证明 HTTP 响应在生成完成前就已经返回。
 */
class SlowStreamProvider implements LLMProvider {
  readonly name = 'slow-stream-mock'
  readonly capabilities: ProviderCapabilities = {
    supportsAudioInput: false,
    supportsStreaming: true,
  }

  async complete(messages: unknown[]): Promise<LLMResponse> {
    return {
      content: JSON.stringify({
        text: 'slow response',
        motionId: 'wave',
        expressionId: 'happy',
        vocabulary: ['slow'],
      }),
    }
  }

  async *stream(): AsyncGenerator<{ content: string; isEnd: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    yield { content: 'slow', isEnd: false }
    yield { content: '', isEnd: true }
  }
}

async function main(): Promise<void> {
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
        userId: 'stream-timing-user',
      },
    })
    const elapsed = Date.now() - start

    assert.strictEqual(
      response.statusCode,
      202,
      `stream mode should return 202, got ${response.statusCode}: ${response.body}`,
    )

    const body = JSON.parse(response.body)
    assert.strictEqual(body.accepted, true, 'stream HTTP response should acknowledge acceptance')

    assert.ok(
      elapsed < 1000,
      `stream HTTP response should return before LLM finishes (took ${elapsed}ms)`,
    )

    console.log(`✅ stream mode returned 202 in ${elapsed}ms before slow LLM completed`)
  } finally {
    ;(tutorEngine as any).llm = originalLlm
    await server.close()
  }
}

main()
  .catch((err) => {
    console.error('❌ stream timing test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
