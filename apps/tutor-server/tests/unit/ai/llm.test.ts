import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLLMProvider } from '@/ai/llm/factory.js'
import { extractTextContent, normalizeToString } from '@/ai/llm/utils.js'
import { config } from '@/config.js'

describe('LLM core providers and message normalization', () => {
  let provider: string
  let deepseekKey: string

  beforeEach(() => {
    provider = config.LLM_PROVIDER
    deepseekKey = config.DEEPSEEK_API_KEY
  })

  afterEach(() => {
    config.LLM_PROVIDER = provider
    config.DEEPSEEK_API_KEY = deepseekKey
  })

  it('normalizes text and multimodal messages', () => {
    expect(extractTextContent({ role: 'user', content: 'hello' })).toBe('hello')
    expect(
      extractTextContent({
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'audio', data: 'abc', format: 'wav' },
          { type: 'text', text: 'world' }
        ]
      })
    ).toBe('hello\nworld')
    expect(
      normalizeToString({
        role: 'user',
        content: [
          { type: 'text', text: 'say' },
          { type: 'audio', data: 'abc', format: 'wav' }
        ]
      }).content
    ).toBe('say')
  })

  it('creates the mock and DeepSeek providers', () => {
    config.LLM_PROVIDER = 'mock'
    expect(createLLMProvider().name).toBe('mock')
    config.LLM_PROVIDER = 'deepseek'
    config.DEEPSEEK_API_KEY = 'test-key'
    expect(createLLMProvider().name).toBe('deepseek')
  })

  it('rejects unsupported providers', () => {
    config.LLM_PROVIDER = 'unknown'
    expect(() => createLLMProvider()).toThrow(/当前仅支持 deepseek 和测试用 mock/)
  })
})
