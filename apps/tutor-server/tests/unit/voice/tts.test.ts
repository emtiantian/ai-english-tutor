import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTTSProvider } from '@/voice/tts.js'
import { config } from '@/config.js'

describe('TTS core providers', () => {
  let provider: string
  let apiKey: string

  beforeEach(() => {
    provider = config.TTS_PROVIDER
    apiKey = config.XIAOMI_TTS_API_KEY
  })

  afterEach(() => {
    config.TTS_PROVIDER = provider
    config.XIAOMI_TTS_API_KEY = apiKey
  })

  it('creates Xiaomi and browser providers', () => {
    config.XIAOMI_TTS_API_KEY = 'test-key'
    config.TTS_PROVIDER = 'xiaomi'
    expect(createTTSProvider().name).toBe('xiaomi')
    config.TTS_PROVIDER = 'browser'
    expect(createTTSProvider().name).toBe('browser')
  })

  it('rejects unsupported providers', () => {
    config.TTS_PROVIDER = 'unknown'
    expect(() => createTTSProvider()).toThrow(/当前仅支持 xiaomi 和 browser/)
  })
})
