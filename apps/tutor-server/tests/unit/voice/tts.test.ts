import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTTSProvider } from '@/voice/tts.js'
import { config } from '@/config.js'

describe('tts provider factory', () => {
  let originalProvider: string
  let originalApiKey: string

  beforeEach(() => {
    originalProvider = config.TTS_PROVIDER
    originalApiKey = config.VOLCENGINE_TTS_API_KEY
  })

  afterEach(() => {
    config.TTS_PROVIDER = originalProvider
    config.VOLCENGINE_TTS_API_KEY = originalApiKey
  })

  it('creates browser provider', () => {
    config.TTS_PROVIDER = 'browser'
    const browserProvider = createTTSProvider()
    expect(browserProvider.name).toBe('browser')
  })

  it('falls back to browser for unknown provider', () => {
    config.TTS_PROVIDER = 'unknown-tts'
    const fallback = createTTSProvider()
    expect(fallback.name).toBe('browser')
  })

  it('throws for volcengine without API key', () => {
    config.TTS_PROVIDER = 'volcengine'
    config.VOLCENGINE_TTS_API_KEY = ''
    expect(() => createTTSProvider()).toThrow(/使用火山方舟 TTS 必须配置 VOLCENGINE_TTS_API_KEY/)
  })

  it('creates volcengine provider with API key', () => {
    config.TTS_PROVIDER = 'volcengine'
    config.VOLCENGINE_TTS_API_KEY = 'test-api-key'
    const volcengineProvider = createTTSProvider()
    expect(volcengineProvider.name).toBe('volcengine')
  })

  it('browser provider returns a valid WAV', async () => {
    config.TTS_PROVIDER = 'browser'
    const browserProvider = createTTSProvider()
    const audio = await browserProvider.synthesize('hello')
    expect(audio.length).toBeGreaterThanOrEqual(44)
    expect(audio.toString('ascii', 0, 4)).toBe('RIFF')
    expect(audio.toString('ascii', 8, 12)).toBe('WAVE')
    expect(audio.toString('ascii', 12, 16)).toBe('fmt ')
    expect(audio.toString('ascii', 36, 40)).toBe('data')
  })
})
