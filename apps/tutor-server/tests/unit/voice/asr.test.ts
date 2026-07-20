import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createASRProvider } from '@/voice/asr.js'
import { config } from '@/config.js'

describe('asr provider factory', () => {
  let originalProvider: string
  let originalAsrApiKey: string

  beforeEach(() => {
    originalProvider = config.ASR_PROVIDER
    originalAsrApiKey = config.VOLCENGINE_ASR_API_KEY
  })

  afterEach(() => {
    config.ASR_PROVIDER = originalProvider
    config.VOLCENGINE_ASR_API_KEY = originalAsrApiKey
  })

  it('creates browser provider', () => {
    config.ASR_PROVIDER = 'browser'
    const browserProvider = createASRProvider()
    expect(browserProvider.name).toBe('browser')
  })

  it('throws for unknown provider', () => {
    config.ASR_PROVIDER = 'unknown-asr'
    expect(() => createASRProvider()).toThrow(/不支持的 ASR 提供商/)
  })

  it('throws for volcengine without API key', () => {
    config.ASR_PROVIDER = 'volcengine'
    config.VOLCENGINE_ASR_API_KEY = ''
    expect(() => createASRProvider()).toThrow(/使用火山方舟 ASR 必须配置 VOLCENGINE_ASR_API_KEY/)
  })

  it('creates volcengine provider with API key', () => {
    config.ASR_PROVIDER = 'volcengine'
    config.VOLCENGINE_ASR_API_KEY = 'test-asr-api-key'
    const volcengineProvider = createASRProvider()
    expect(volcengineProvider.name).toBe('volcengine')
  })

  it('throws when browser provider receives audio', async () => {
    config.ASR_PROVIDER = 'browser'
    const browserProvider = createASRProvider()
    await expect(browserProvider.transcribe(Buffer.alloc(1024), 'audio/webm')).rejects.toThrow(/ASR_PROVIDER=browser/)
  })
})
