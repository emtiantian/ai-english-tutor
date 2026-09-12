import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../src/audio/browser-asr.js', () => ({
  isBrowserASRSupported: () => true,
  recognizeSpeech: vi.fn().mockResolvedValue({ transcript: 'I would like some tea, please.' })
}))

import { useAudioRecorder } from '../../src/composables/useAudioRecorder.js'
import { recognizeSpeech } from '../../src/audio/browser-asr.js'
import { TutorClient } from '../../src/client/TutorClient.js'
import { useTutorStore } from '../../src/stores/tutor.js'

describe('useAudioRecorder', () => {
  it('reports recognition failures outside the conversation without sending a turn', async () => {
    setActivePinia(createPinia())
    vi.mocked(recognizeSpeech).mockRejectedValueOnce(new Error('没有识别结果'))
    const send = vi.fn()
    await useAudioRecorder(
      new TutorClient({ baseUrl: '', sessionId: 'test' }),
      send
    ).startRecording()
    expect(useTutorStore().messages).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
  })
  it('releases the button to finish recognition and send, rather than cancel', async () => {
    setActivePinia(createPinia())
    const send = vi.fn().mockResolvedValue({ text: 'Sure.' })
    vi.mocked(recognizeSpeech).mockImplementationOnce(
      options =>
        new Promise(resolve => {
          options?.stopSignal?.addEventListener('abort', () => {
            expect(options.signal?.aborted).toBe(false)
            resolve({ transcript: 'A cup of tea.', confidence: 1 })
          })
        })
    )
    const recorder = useAudioRecorder(new TutorClient({ baseUrl: '', sessionId: 'test' }), send)
    const pending = recorder.startRecording()
    await recorder.stopRecording()
    expect(recorder.isEncoding.value).toBe(true)
    await pending
    expect(send).toHaveBeenCalledWith({ type: 'user.speak', text: 'A cup of tea.', stream: true })
    expect(recorder.isEncoding.value).toBe(false)
  })

  it('aborts the recognition signal on cancel without sending a turn', async () => {
    setActivePinia(createPinia())
    const send = vi.fn()
    vi.mocked(recognizeSpeech).mockImplementationOnce(
      options =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Cancelled', 'AbortError'))
          )
        })
    )
    const recorder = useAudioRecorder(new TutorClient({ baseUrl: '', sessionId: 'test' }), send)
    const pending = recorder.startRecording()
    recorder.cancelRecording()
    await pending
    expect(send).not.toHaveBeenCalled()
    expect(recorder.isRecording.value).toBe(false)
  })
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
