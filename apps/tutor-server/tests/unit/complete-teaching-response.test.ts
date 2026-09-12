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

describe('complete teaching response', () => {
  it('keeps a translated reply with no vocabulary without another request', async () => {
    const llm = provider('')
    const result = await parseCompleteTeachingResponse(
      JSON.stringify({ text: 'Hello.', textZh: '你好。', vocabulary: [] }),
      llm
    )
    expect(result.textZh).toBe('你好。')
    expect(result.vocabulary).toEqual([])
    expect(llm.complete).not.toHaveBeenCalled()
  })
  it('repairs missing translation while preserving English and cancellation', async () => {
    const llm = provider('{"textZh":"茶马上就来。"}')
    const signal = new AbortController().signal
    const result = await parseCompleteTeachingResponse('Tea, coming right up.', llm, signal)
    expect(result.text).toBe('Tea, coming right up.')
    expect(result.textZh).toBe('茶马上就来。')
    expect(llm.complete).toHaveBeenCalledWith(expect.any(Array), signal)
  })
  it('rejects an incomplete repair instead of silently accepting no translation', async () => {
    await expect(parseCompleteTeachingResponse('Hello.', provider('{}'))).rejects.toThrow(
      '中文翻译生成失败'
    )
  })
})
