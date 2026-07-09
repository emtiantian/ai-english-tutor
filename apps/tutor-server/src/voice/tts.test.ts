import assert from 'node:assert'
import { createTTSProvider } from './tts.js'
import { config } from '../config.js'

async function main(): Promise<void> {
  const originalProvider = config.TTS_PROVIDER

  // ── createTTSProvider 工厂 ─────────────────────────────────

  config.TTS_PROVIDER = 'browser'
  const browserProvider = createTTSProvider()
  assert.strictEqual(browserProvider.name, 'browser')

  config.TTS_PROVIDER = 'unknown-tts'
  const fallback = createTTSProvider()
  assert.strictEqual(fallback.name, 'browser', 'unknown TTS provider falls back to browser')

  // ── Volcengine provider：需要 API Key ────────────────────────

  const originalApiKey = config.VOLCENGINE_TTS_API_KEY

  config.TTS_PROVIDER = 'volcengine'
  config.VOLCENGINE_TTS_API_KEY = ''
  assert.throws(
    () => createTTSProvider(),
    /使用火山方舟 TTS 必须配置 VOLCENGINE_TTS_API_KEY/,
    'Volcengine TTS without API key should throw',
  )

  config.VOLCENGINE_TTS_API_KEY = 'test-api-key'
  const volcengineProvider = createTTSProvider()
  assert.strictEqual(volcengineProvider.name, 'volcengine')

  config.VOLCENGINE_TTS_API_KEY = originalApiKey

  // ── BrowserTTSProvider 输出 ─────────────────────────────────

  const audio = await browserProvider.synthesize('hello')
  assert.ok(audio.length >= 44, 'browser TTS should return at least a WAV header')
  assert.strictEqual(audio.toString('ascii', 0, 4), 'RIFF')
  assert.strictEqual(audio.toString('ascii', 8, 12), 'WAVE')
  assert.strictEqual(audio.toString('ascii', 12, 16), 'fmt ')
  assert.strictEqual(audio.toString('ascii', 36, 40), 'data')

  config.TTS_PROVIDER = originalProvider
  console.log('✅ tts test passed')
}

main().catch((err) => {
  console.error('❌ tts test failed:', err)
  process.exitCode = 1
})
