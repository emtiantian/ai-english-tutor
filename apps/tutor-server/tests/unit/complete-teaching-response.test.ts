import { describe, expect, it, vi } from 'vitest'
import { parseCompleteTeachingResponse } from '../../src/ai/response/complete-teaching-response.js'
import type { LLMProvider } from '../../src/ai/llm.js'

function provider(content: string) {
  return {
    name: 'test',
    capabilities: { supportsAudioInput: false, supportsStreaming: false },
    complete: vi.fn().mockResolvedValue({ content })
  } satisfies LLMProvider
}

function response(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    text: 'Tea, coming right up.',
    textZh: '茶马上就来。',
    motionId: 'nod',
    expressionId: 'happy',
    vocabulary: [],
    vocabularySentences: [],
    studentReplyHints: ['Thank you.'],
    ...overrides
  })
}

describe('complete teaching response', () => {
  it('accepts a complete main response without repair', async () => {
    const llm = provider('')
    const result = await parseCompleteTeachingResponse(response(), llm)
    expect(result.textZh).toBe('茶马上就来。')
    expect(result.studentReplyHints).toEqual(['Thank you.'])
    expect(llm.complete).not.toHaveBeenCalled()
  })

  it('repairs the whole structure when translation or hints are missing', async () => {
    const llm = provider(response())
    const signal = new AbortController().signal
    const result = await parseCompleteTeachingResponse(
      response({ textZh: '', studentReplyHints: [] }),
      llm,
      signal
    )
    expect(result.textZh).toBe('茶马上就来。')
    expect(result.studentReplyHints).toEqual(['Thank you.'])
    expect(llm.complete).toHaveBeenCalledWith(expect.any(Array), signal, {
      responseFormat: 'json'
    })
  })

  it('rejects an incomplete repair instead of silently accepting missing fields', async () => {
    await expect(parseCompleteTeachingResponse('Hello.', provider('{}'))).rejects.toThrow(
      '缺少中文翻译或下一句提示'
    )
  })
})
