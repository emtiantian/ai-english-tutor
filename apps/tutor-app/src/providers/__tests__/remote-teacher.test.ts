import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteTeacherProvider } from '../remote-teacher'
import type { TutorClient } from '../../client/TutorClient'

describe('RemoteTeacherProvider', () => {
  let provider: RemoteTeacherProvider
  let mockClient: any

  beforeEach(() => {
    mockClient = {
      sendMessage: vi.fn().mockResolvedValue({
        text: 'Hello student!',
        motionId: 'wave',
        expressionId: 'happy',
        vocabulary: ['hello', 'student']
      }),
      emit: vi.fn()
    }

    provider = new RemoteTeacherProvider(mockClient as TutorClient)
  })

  it('should send message to backend', async () => {
    await provider.generateResponse({ text: 'Hi', level: 3 })

    expect(mockClient.sendMessage).toHaveBeenCalledWith({
      type: 'user.speak',
      text: 'Hi',
      level: 3
    })
  })

  it('should emit user message event', async () => {
    await provider.generateResponse({ text: 'Hi', level: 3 })

    expect(mockClient.emit).toHaveBeenCalledWith('message.user', {
      text: 'Hi',
      isVoice: false
    })
  })

  it('should emit thinking state', async () => {
    await provider.generateResponse({ text: 'Hi', level: 3 })

    expect(mockClient.emit).toHaveBeenCalledWith('state.thinking', undefined)
  })

  it('should return teaching response from backend', async () => {
    const result = await provider.generateResponse({ text: 'Hi', level: 3 })

    expect(result).toEqual({
      text: 'Hello student!',
      motionId: 'wave',
      expressionId: 'happy',
      vocabulary: ['hello', 'student']
    })
  })
})
