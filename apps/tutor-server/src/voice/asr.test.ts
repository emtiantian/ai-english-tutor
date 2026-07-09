import assert from 'node:assert'
import { createASRProvider } from './asr.js'
import { config } from '../config.js'

async function main(): Promise<void> {
  const originalProvider = config.ASR_PROVIDER

  // ── createASRProvider 工厂 ─────────────────────────────────

  config.ASR_PROVIDER = 'browser'
  const browserProvider = createASRProvider()
  assert.strictEqual(browserProvider.name, 'browser')

  config.ASR_PROVIDER = 'unknown-asr'
  const fallback = createASRProvider()
  assert.strictEqual(fallback.name, 'browser', 'unknown ASR provider falls back to browser')

  // ── Volcengine provider：需要 API Key ───────────────────────

  const originalAsrApiKey = config.VOLCENGINE_ASR_API_KEY

  config.ASR_PROVIDER = 'volcengine'
  config.VOLCENGINE_ASR_API_KEY = ''
  assert.throws(
    () => createASRProvider(),
    /使用火山方舟 ASR 必须配置 VOLCENGINE_ASR_API_KEY/,
    'Volcengine ASR without API key should throw',
  )

  config.VOLCENGINE_ASR_API_KEY = 'test-asr-api-key'
  const volcengineProvider = createASRProvider()
  assert.strictEqual(volcengineProvider.name, 'volcengine')

  config.VOLCENGINE_ASR_API_KEY = originalAsrApiKey

  // ── BrowserASRProvider 输出 ─────────────────────────────────

  const result = await browserProvider.transcribe(Buffer.alloc(1024), 'audio/webm')
  assert.strictEqual(result.text, '')
  assert.strictEqual(result.confidence, 0)
  assert.strictEqual(result.language, 'en')

  config.ASR_PROVIDER = originalProvider
  console.log('✅ asr test passed')
}

main().catch((err) => {
  console.error('❌ asr test failed:', err)
  process.exitCode = 1
})
