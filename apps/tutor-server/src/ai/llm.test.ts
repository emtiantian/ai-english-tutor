import assert from 'node:assert'
import { createLLMProvider, extractTextContent, normalizeToString } from './llm.js'
import { config } from '../config.js'

async function main(): Promise<void> {
  // ── extractTextContent ────────────────────────────────────

  assert.strictEqual(extractTextContent({ role: 'user', content: 'hello' }), 'hello')
  assert.strictEqual(
    extractTextContent({
      role: 'user',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'audio', data: 'abc', format: 'wav' },
        { type: 'text', text: 'world' },
      ],
    }),
    'hello\nworld',
  )
  assert.strictEqual(extractTextContent(undefined), '')

  // ── normalizeToString ─────────────────────────────────────

  const stringMessage = { role: 'user' as const, content: 'plain text' }
  assert.deepStrictEqual(normalizeToString(stringMessage), stringMessage)

  const multiMessage = {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: 'say' },
      { type: 'audio' as const, data: 'abc', format: 'wav' },
    ],
  }
  const normalized = normalizeToString(multiMessage)
  assert.strictEqual(normalized.content, 'say')

  // ── createLLMProvider 工厂 ─────────────────────────────

  const originalProvider = config.LLM_PROVIDER

  config.LLM_PROVIDER = 'mock'
  const mockProvider = createLLMProvider()
  assert.strictEqual(mockProvider.name, 'mock')
  assert.strictEqual(mockProvider.capabilities.supportsStreaming, true)
  assert.strictEqual(mockProvider.capabilities.supportsAudioInput, false)

  config.LLM_PROVIDER = 'unknown-provider'
  const fallback = createLLMProvider()
  assert.strictEqual(fallback.name, 'mock', 'unknown provider falls back to mock')

  // ── MockProvider abort 行为 ───────────────────────────

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    mockProvider.complete([{ role: 'user', content: 'hi' }], controller.signal),
    /AbortError/,
  )

  const streamController = new AbortController()
  streamController.abort()
  await assert.rejects(
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of mockProvider.stream!([{ role: 'user', content: 'hi' }], { signal: streamController.signal })) {
        // 空操作
      }
    })(),
    /AbortError/,
  )

  config.LLM_PROVIDER = originalProvider
  console.log('✅ llm test passed')
}

main().catch((err) => {
  console.error('❌ llm test failed:', err)
  process.exitCode = 1
})
