import assert from 'node:assert'
import { createTTSProvider } from './tts.js'
import { config } from '../config.js'

async function main(): Promise<void> {
  const originalProvider = config.TTS_PROVIDER

  // ── createTTSProvider factory ─────────────────────────────

  config.TTS_PROVIDER = 'browser'
  const browserProvider = createTTSProvider()
  assert.strictEqual(browserProvider.name, 'browser')

  config.TTS_PROVIDER = 'unknown-tts'
  const fallback = createTTSProvider()
  assert.strictEqual(fallback.name, 'browser', 'unknown TTS provider falls back to browser')

  // ── Volcengine provider: requires appid + access token ───────
  const originalAppId = config.VOLCENGINE_TTS_APP_ID
  const originalToken = config.VOLCENGINE_TTS_ACCESS_TOKEN

  config.TTS_PROVIDER = 'volcengine'
  config.VOLCENGINE_TTS_APP_ID = ''
  config.VOLCENGINE_TTS_ACCESS_TOKEN = ''
  assert.throws(
    () => createTTSProvider(),
    /VOLCENGINE_TTS_APP_ID and VOLCENGINE_TTS_ACCESS_TOKEN/,
    'Volcengine TTS without credentials should throw',
  )

  config.VOLCENGINE_TTS_APP_ID = 'test-app-id'
  config.VOLCENGINE_TTS_ACCESS_TOKEN = 'test-token'
  const volcengineProvider = createTTSProvider()
  assert.strictEqual(volcengineProvider.name, 'volcengine')

  // 可选 model / resource_id 不应影响 provider 初始化
  const originalModel = config.VOLCENGINE_TTS_MODEL
  const originalResourceId = config.VOLCENGINE_TTS_RESOURCE_ID
  config.VOLCENGINE_TTS_MODEL = 'doubao-seed-2.0-mini'
  config.VOLCENGINE_TTS_RESOURCE_ID = 'seed-tts-2.0'
  assert.doesNotThrow(() => createTTSProvider(), 'Volcengine TTS with model/resource_id should initialize')
  config.VOLCENGINE_TTS_MODEL = originalModel
  config.VOLCENGINE_TTS_RESOURCE_ID = originalResourceId

  config.VOLCENGINE_TTS_APP_ID = originalAppId
  config.VOLCENGINE_TTS_ACCESS_TOKEN = originalToken

  // ── BrowserTTSProvider output ────────────────────────────────

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
