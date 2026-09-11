import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/audio/browser-asr.js', () => ({
  isBrowserASRSupported: () => true,
  recognizeSpeech: vi.fn().mockResolvedValue({ transcript: 'I would like some tea, please.' })
}))

import { useAudioRecorder } from '../../src/composables/useAudioRecorder.js'

describe('useAudioRecorder', () => {
  it('sends the browser transcript as a text turn', async () => {
    setActivePinia(createPinia())
    const send = vi.fn().mockResolvedValue({ text: 'Sure.' })
    const client = { emit: vi.fn() } as any
    const recorder = useAudioRecorder(client, send)
    await recorder.startRecording()
    expect(send).toHaveBeenCalledWith({
      type: 'user.speak',
      text: 'I would like some tea, please.',
      stream: true
    })
    expect(recorder.isRecording.value).toBe(false)
  })
})
