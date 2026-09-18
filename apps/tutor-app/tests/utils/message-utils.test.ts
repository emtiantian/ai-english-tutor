import type { ChatMessage } from '../../src/stores/tutor.js'
import { createMessageId, findLastAssistantMessage } from '../../src/utils/message-utils.js'

describe('message-utils', () => {
  it('creates message ids with the expected prefix', () => {
    expect(createMessageId()).toMatch(/^msg-\d+-\d+$/)
  })

  it('finds the last assistant message', () => {
    const messages = [
      { role: 'assistant', text: 'first' },
      { role: 'user', text: 'reply' },
      { role: 'assistant', text: 'last' }
    ] as ChatMessage[]

    expect(findLastAssistantMessage(messages)?.text).toBe('last')
  })
})
