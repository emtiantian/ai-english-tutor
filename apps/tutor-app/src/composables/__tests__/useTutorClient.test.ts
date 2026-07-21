import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTutorClient } from '../useTutorClient'
import { useTutorStore } from '../../stores/tutor'

// 模拟 TutorClient
const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
const mockOn = vi.fn().mockReturnValue(vi.fn())
const mockSendMessage = vi.fn()

vi.mock('../../client/TutorClient', () => ({
  TutorClient: class MockTutorClient {
    connect = mockConnect
    disconnect = mockDisconnect
    on = mockOn
    sendMessage = mockSendMessage
    isConnected = false
  }
}))

describe('useTutorClient', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should create TutorClient with correct config', () => {
    const { client } = useTutorClient()
    expect(client).toBeDefined()
  })

  it('should wire connected event to store', () => {
    const store = useTutorStore()
    const { client } = useTutorClient()

    const connectedHandler = (client.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'connected'
    )?.[1]

    expect(store.isConnected).toBe(false)
    connectedHandler?.()
    expect(store.isConnected).toBe(true)
  })

  it('should wire thinking event to store', () => {
    const store = useTutorStore()
    const { client } = useTutorClient()

    const thinkingHandler = (client.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'state.thinking'
    )?.[1]

    expect(store.isThinking).toBe(false)
    thinkingHandler?.()
    expect(store.isThinking).toBe(true)
  })

  it('should wire user message event to store', () => {
    const store = useTutorStore()
    const { client } = useTutorClient()

    const messageHandler = (client.on as any).mock.calls.find(
      (call: any[]) => call[0] === 'message.user'
    )?.[1]

    expect(store.messages).toHaveLength(0)
    messageHandler?.({ text: 'Hello', isVoice: false })
    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].text).toBe('Hello')
  })

  it('should return unsubscribe on cleanup', () => {
    const { unsubscribeAll } = useTutorClient()
    expect(typeof unsubscribeAll).toBe('function')
  })
})
