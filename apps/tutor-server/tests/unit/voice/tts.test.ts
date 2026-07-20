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

  it('throws for unknown provider', () => {
    config.TTS_PROVIDER = 'unknown-tts'
    expect(() => createTTSProvider()).toThrow(/不支持的 TTS 提供商/)
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

  it('throws when browser provider is asked to synthesize', async () => {
    config.TTS_PROVIDER = 'browser'
    const browserProvider = createTTSProvider()
    await expect(browserProvider.synthesize('hello')).rejects.toThrow(/TTS_PROVIDER=browser/)
  })
})
