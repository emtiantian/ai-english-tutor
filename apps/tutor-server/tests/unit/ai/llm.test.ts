import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLLMProvider } from '@/ai/llm/factory.js'
import { extractTextContent, normalizeToString } from '@/ai/llm/utils.js'
import { config } from '@/config.js'

describe('llm factory and utils', () => {
  let originalProvider: string
  let originalDeepseekKey: string
  let originalVolcengineKey: string
  let originalVolcengineModel: string
  let originalXiaomiKey: string
  let originalXiaomiModel: string

  beforeEach(() => {
    originalProvider = config.LLM_PROVIDER
    originalDeepseekKey = config.DEEPSEEK_API_KEY
    originalVolcengineKey = config.VOLCENGINE_LLM_API_KEY
    originalVolcengineModel = config.VOLCENGINE_LLM_MODEL
    originalXiaomiKey = config.XIAOMI_API_KEY
    originalXiaomiModel = config.XIAOMI_MODEL
  })

  afterEach(() => {
    config.LLM_PROVIDER = originalProvider
    config.DEEPSEEK_API_KEY = originalDeepseekKey
    config.VOLCENGINE_LLM_API_KEY = originalVolcengineKey
    config.VOLCENGINE_LLM_MODEL = originalVolcengineModel
    config.XIAOMI_API_KEY = originalXiaomiKey
    config.XIAOMI_MODEL = originalXiaomiModel
  })

  it('extractTextContent handles string content', () => {
    expect(extractTextContent({ role: 'user', content: 'hello' })).toBe('hello')
  })

  it('extractTextContent joins multimodal text parts', () => {
    expect(
      extractTextContent({
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'audio', data: 'abc', format: 'wav' },
          { type: 'text', text: 'world' },
        ],
      }),
    ).toBe('hello\nworld')
  })

  it('extractTextContent handles undefined', () => {
    expect(extractTextContent(undefined)).toBe('')
  })

  it('normalizeToString returns string message as-is', () => {
    const stringMessage = { role: 'user' as const, content: 'plain text' }
    expect(normalizeToString(stringMessage)).toEqual(stringMessage)
  })

  it('normalizeToString normalizes multimodal to string', () => {
    const multiMessage = {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: 'say' },
        { type: 'audio' as const, data: 'abc', format: 'wav' },
      ],
    }
    const normalized = normalizeToString(multiMessage)
    expect(normalized.content).toBe('say')
  })

  it('createLLMProvider returns mock provider', () => {
    config.LLM_PROVIDER = 'mock'
    const mockProvider = createLLMProvider()
    expect(mockProvider.name).toBe('mock')
    expect(mockProvider.capabilities.supportsStreaming).toBe(true)
    expect(mockProvider.capabilities.supportsAudioInput).toBe(false)
  })

  it('createLLMProvider falls back to mock for unknown provider', () => {
    config.LLM_PROVIDER = 'unknown-provider'
    const fallback = createLLMProvider()
    expect(fallback.name).toBe('mock')
  })

  it('creates deepseek provider', () => {
    config.LLM_PROVIDER = 'deepseek'
    config.DEEPSEEK_API_KEY = 'fake-key'
    const deepseekProvider = createLLMProvider()
    expect(deepseekProvider.name).toBe('deepseek')
    expect(deepseekProvider.capabilities.supportsStreaming).toBe(true)
    expect(deepseekProvider.capabilities.supportsAudioInput).toBe(false)
  })

  it('creates volcengine provider', () => {
    config.LLM_PROVIDER = 'volcengine'
    config.VOLCENGINE_LLM_API_KEY = 'fake-key'
    config.VOLCENGINE_LLM_MODEL = 'ep-fake'
    const volcengineProvider = createLLMProvider()
    expect(volcengineProvider.name).toBe('volcengine')
    expect(volcengineProvider.capabilities.supportsStreaming).toBe(true)
    expect(volcengineProvider.capabilities.supportsAudioInput).toBe(false)
  })

  it('creates xiaomi provider', () => {
    config.LLM_PROVIDER = 'xiaomi'
    config.XIAOMI_API_KEY = 'fake-key'
    config.XIAOMI_MODEL = 'mimo-v2.5'
    const xiaomiProvider = createLLMProvider()
    expect(xiaomiProvider.name).toBe('xiaomi')
    expect(xiaomiProvider.capabilities.supportsStreaming).toBe(true)
    expect(xiaomiProvider.capabilities.supportsAudioInput).toBe(true)
  })

  it('mock provider rejects complete on aborted signal', async () => {
    config.LLM_PROVIDER = 'mock'
    const mockProvider = createLLMProvider()
    const controller = new AbortController()
    controller.abort()
    await expect(mockProvider.complete([{ role: 'user', content: 'hi' }], controller.signal)).rejects.toThrow(/AbortError/)
  })

  it('mock provider rejects stream on aborted signal', async () => {
    config.LLM_PROVIDER = 'mock'
    const mockProvider = createLLMProvider()
    const streamController = new AbortController()
    streamController.abort()

    await expect(
      (async () => {
        for await (const _ of mockProvider.stream!([{ role: 'user', content: 'hi' }], { signal: streamController.signal })) {
          // no-op
        }
      })(),
    ).rejects.toThrow(/AbortError/)
  })
})
