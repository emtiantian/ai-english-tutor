import { describe, expect, it } from 'vitest'
import { SessionManager } from '@/ai/session-manager.js'

describe('SessionManager conversation history', () => {
  it('将 assistant 历史保存为完整 JSON 契约而不是纯英文正文', () => {
    const sessions = new SessionManager()
    const session = sessions.getOrCreate('session-1', 4)

    sessions.addMessage('session-1', session, 'assistant', 'Would you like the menu?', {
      text: 'Would you like the menu?',
      textZh: '您想看看菜单吗？',
      motionId: 'gesture',
      expressionId: 'curious',
      vocabulary: ['menu'],
      vocabularySentences: ['Could I see the menu, please?'],
      studentReplyHints: ['Yes, please. Could I see the menu?']
    })

    const saved = JSON.parse(session.history[0].content)
    expect(saved).toEqual({
      text: 'Would you like the menu?',
      textZh: '您想看看菜单吗？',
      motionId: 'gesture',
      expressionId: 'curious',
      vocabulary: ['menu'],
      vocabularySentences: ['Could I see the menu, please?'],
      studentReplyHints: ['Yes, please. Could I see the menu?']
    })
  })

  it('用户历史仍保持原始文本', () => {
    const sessions = new SessionManager()
    const session = sessions.getOrCreate('session-2', 4)

    sessions.addMessage('session-2', session, 'user', 'Water, please.')

    expect(session.history).toEqual([{ role: 'user', content: 'Water, please.' }])
  })
})
