import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

describe('tts-cache buildCacheKey', () => {
  const env = createTestEnv('tts-cache')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('returns a 64-char hex SHA256 string', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    expect(typeof baseKey).toBe('string')
    expect(baseKey.length).toBe(64)
  })

  it('produces different keys for different voices', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    const keyVoiceA = buildCacheKey('Hello, how are you today?', { voice: 'alloy' })
    const keyVoiceB = buildCacheKey('Hello, how are you today?', { voice: 'nova' })
    expect(keyVoiceA).not.toBe(keyVoiceB)
    expect(keyVoiceA).not.toBe(baseKey)
  })

  it('produces different keys for different formats', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    const keyFormatA = buildCacheKey('Hello, how are you today?', { format: 'mp3' })
    const keyFormatB = buildCacheKey('Hello, how are you today?', { format: 'wav' })
    expect(keyFormatA).not.toBe(keyFormatB)
    expect(keyFormatA).not.toBe(baseKey)
  })

  it('produces different keys for different speeds', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    const keySpeedA = buildCacheKey('Hello, how are you today?', { speed: 1.0 })
    const keySpeedB = buildCacheKey('Hello, how are you today?', { speed: 0.9 })
    expect(keySpeedA).not.toBe(keySpeedB)
    expect(keySpeedA).not.toBe(baseKey)
  })

  it('produces different keys for different voiceDesigns', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    const keyDesignA = buildCacheKey('Hello, how are you today?', { voiceDesign: '温柔女声' })
    const keyDesignB = buildCacheKey('Hello, how are you today?', { voiceDesign: '磁性男声' })
    expect(keyDesignA).not.toBe(keyDesignB)
    expect(keyDesignA).not.toBe(baseKey)
  })

  it('produces different keys for different modes', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    const keyModeA = buildCacheKey('Hello, how are you today?', { mode: 'preset' })
    const keyModeB = buildCacheKey('Hello, how are you today?', { mode: 'voicedesign' })
    expect(keyModeA).not.toBe(keyModeB)
    expect(keyModeA).not.toBe(baseKey)
  })

  it('produces the same key for identical options', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const fullOpts = {
      voice: 'Chloe',
      format: 'wav',
      speed: 0.9,
      voiceDesign: '成熟御姐',
      mode: 'preset'
    }
    const key1 = buildCacheKey('Hello, how are you today?', fullOpts)
    const key2 = buildCacheKey('Hello, how are you today?', { ...fullOpts })
    expect(key1).toBe(key2)
  })

  it('produces different keys for different text', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const fullOpts = {
      voice: 'Chloe',
      format: 'wav',
      speed: 0.9,
      voiceDesign: '成熟御姐',
      mode: 'preset'
    }
    const key1 = buildCacheKey('Hello, how are you today?', fullOpts)
    const keyTextB = buildCacheKey('Good morning!', fullOpts)
    expect(key1).not.toBe(keyTextB)
  })

  it('treats empty string voice/format the same as missing', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    const keyEmptyVoice = buildCacheKey('Hello, how are you today?', { voice: '' })
    const keyEmptyFormat = buildCacheKey('Hello, how are you today?', { format: '' })
    expect(keyEmptyVoice).toBe(baseKey)
    expect(keyEmptyFormat).toBe(baseKey)
  })

  it('treats speed=0 as a valid value distinct from missing', async () => {
    const { buildCacheKey } = await import('@/voice/tts-cache.js')
    const baseKey = buildCacheKey('Hello, how are you today?', {})
    const keySpeedZero = buildCacheKey('Hello, how are you today?', { speed: 0 })
    expect(keySpeedZero).not.toBe(baseKey)
  })
})
