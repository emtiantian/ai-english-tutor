import assert from 'node:assert'
import { createLLMProvider } from './llm/factory.js'
import { extractTextContent, normalizeToString } from './llm/utils.js'
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

  // ── 真实 Provider 工厂（不发起网络请求）────────────────────

  config.LLM_PROVIDER = 'deepseek'
  config.DEEPSEEK_API_KEY = 'fake-key'
  const deepseekProvider = createLLMProvider()
  assert.strictEqual(deepseekProvider.name, 'deepseek')
  assert.strictEqual(deepseekProvider.capabilities.supportsStreaming, true)
  assert.strictEqual(deepseekProvider.capabilities.supportsAudioInput, false)

  config.LLM_PROVIDER = 'volcengine'
  config.VOLCENGINE_LLM_API_KEY = 'fake-key'
  config.VOLCENGINE_LLM_MODEL = 'ep-fake'
  const volcengineProvider = createLLMProvider()
  assert.strictEqual(volcengineProvider.name, 'volcengine')
  assert.strictEqual(volcengineProvider.capabilities.supportsStreaming, true)
  assert.strictEqual(volcengineProvider.capabilities.supportsAudioInput, false)

  config.LLM_PROVIDER = 'xiaomi'
  config.XIAOMI_API_KEY = 'fake-key'
  config.XIAOMI_MODEL = 'mimo-v2.5'
  const xiaomiProvider = createLLMProvider()
  assert.strictEqual(xiaomiProvider.name, 'xiaomi')
  assert.strictEqual(xiaomiProvider.capabilities.supportsStreaming, true)
  assert.strictEqual(xiaomiProvider.capabilities.supportsAudioInput, true)

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
