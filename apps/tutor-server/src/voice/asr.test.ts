import assert from 'node:assert'
import { createASRProvider } from './asr.js'
import { config } from '../config.js'

async function main(): Promise<void> {
  const originalProvider = config.ASR_PROVIDER

  // ── createASRProvider factory ─────────────────────────────

  config.ASR_PROVIDER = 'browser'
  const browserProvider = createASRProvider()
  assert.strictEqual(browserProvider.name, 'browser')

  config.ASR_PROVIDER = 'unknown-asr'
  const fallback = createASRProvider()
  assert.strictEqual(fallback.name, 'browser', 'unknown ASR provider falls back to browser')

  // ── BrowserASRProvider output ────────────────────────────────

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
