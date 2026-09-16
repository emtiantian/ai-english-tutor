import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAudioPlayback } from '../../src/composables/useAudioPlayback.js'
import { useTutorStore } from '../../src/stores/tutor.js'
import type { TutorClient } from '../../src/client/TutorClient.js'

describe('useAudioPlayback', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      this.dispatchEvent(new Event('playing'))
      return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test-audio'),
      revokeObjectURL: vi.fn()
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('收到远程音频时纠正初始 local 配置并保存音频用于重播', async () => {
    const handlers = new Map<string, (payload: unknown) => void>()
    const client = {
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler)
        return vi.fn()
      })
    } as unknown as TutorClient
    const store = useTutorStore()
    store.messages.push({
      id: 'assistant-1',
      role: 'assistant',
      text: 'Hello',
      timestamp: Date.now()
    })

    useAudioPlayback(client)
    handlers.get('teacher.audio')?.({
      audioBase64: 'YQ==',
      format: 'mp3',
      isEnd: true,
      requestId: 'request-1'
    })
    await Promise.resolve()

    expect(store.ttsSource).toBe('remote')
    expect(store.messages[0].audioBase64).toBe('YQ==')
  })
})
