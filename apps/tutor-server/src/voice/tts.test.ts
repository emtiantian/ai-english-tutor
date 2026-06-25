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
