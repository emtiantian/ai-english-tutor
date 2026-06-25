import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-stream-race-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')
process.env.LLM_PROVIDER = 'mock'
process.env.TTS_PROVIDER = 'browser'
process.env.ASR_PROVIDER = 'browser'
process.env.CORS_ORIGIN = '*'

const { createServer } = await import('../server.js')

async function main(): Promise<void> {
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
      userId: 'stream-test-user',
    },
  })

  assert.strictEqual(
    response.statusCode,
    202,
    `stream mode should return 202, got ${response.statusCode}: ${response.body}`,
  )

  const body = JSON.parse(response.body)
  assert.strictEqual(body.accepted, true, 'stream HTTP response should acknowledge acceptance')
  assert.strictEqual(
    body.text,
    undefined,
    'stream HTTP response should NOT contain assistant response text (data goes via SSE)',
  )

  await server.close()
  console.log('✅ stream mode HTTP/SSE race test passed')
}

main()
  .catch((err) => {
    console.error('❌ stream mode HTTP/SSE race test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
