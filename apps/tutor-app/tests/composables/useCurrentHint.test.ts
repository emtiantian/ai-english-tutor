import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useCurrentHint } from '../../src/composables/useCurrentHint.js'
import type { ChatMessage } from '../../src/stores/tutor.js'

function assistantMessage(
  id: string,
  studentReplyHints?: string[],
  isStreaming = false
): ChatMessage {
  return {
    id,
    role: 'assistant',
    text: '',
    studentReplyHints,
    isStreaming,
    timestamp: Date.now()
  }
}

describe('useCurrentHint', () => {
  it('连续对话时展示最新一轮 LLM 返回的提示', () => {
    const messages = ref<ChatMessage[]>([assistantMessage('first', ['How much is it?'])])
    const { suggestedPhrases } = useCurrentHint({ messages })

    expect(suggestedPhrases.value).toEqual(['How much is it?'])

    messages.value.push({
      id: 'user',
      role: 'user',
      text: 'It is ten dollars.',
      timestamp: Date.now()
    })
    messages.value.push(assistantMessage('second', ['Can I pay by card?', 'Do you take cash?']))

    expect(suggestedPhrases.value).toEqual(['Can I pay by card?', 'Do you take cash?'])
  })

  it('新一轮生成期间不回退显示历史提示', () => {
    const messages = ref<ChatMessage[]>([
      assistantMessage('first', ['How much is it?']),
      assistantMessage('second', undefined, true)
    ])
    const { suggestedPhrases } = useCurrentHint({ messages })

    expect(suggestedPhrases.value).toEqual([])

    messages.value[1].studentReplyHints = ['Can I pay by card?']
    messages.value[1].isStreaming = false

    expect(suggestedPhrases.value).toEqual(['Can I pay by card?'])
  })
})
