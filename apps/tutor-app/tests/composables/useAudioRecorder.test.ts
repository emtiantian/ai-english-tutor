// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAudioRecorder } from '../../src/composables/useAudioRecorder.js'
import { useTutorStore } from '../../src/stores/tutor.js'

vi.mock('../../src/composables/useAudioEncoder.js', () => ({
  useAudioEncoder: () => ({
    isEncoding: { value: false },
    encode: vi.fn(async samples => {
      return new Blob([samples.buffer], { type: 'audio/mp3' })
    }),
    terminate: vi.fn()
  })
}))

const mockSendToBackend = vi.fn()

describe('useAudioRecorder', () => {
  let mockMediaRecorder: any
  let mockStream: any
  let decodedBuffer: AudioBuffer

  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      state: 'inactive',
      mimeType: 'audio/webm',
      ondataavailable: null as any,
      onstop: null as any
    }

    mockStream = {
      getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }])
    }

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      writable: true
    })

    global.MediaRecorder = vi.fn(function () {
      mockMediaRecorder.state = 'recording'
      return mockMediaRecorder
    }) as any
    global.MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true)

    decodedBuffer = {
      sampleRate: 48000,
      getChannelData: vi.fn().mockReturnValue(new Float32Array([0.1, -0.1, 0.2]))
    } as unknown as AudioBuffer

    const mockAudioContext: any = {}
    mockAudioContext.decodeAudioData = vi.fn().mockResolvedValue(decodedBuffer)
    mockAudioContext.close = vi.fn().mockResolvedValue(undefined)
    mockAudioContext.createMediaStreamSource = vi.fn().mockReturnValue({
      connect: vi.fn(),
      context: mockAudioContext
    })
    mockAudioContext.createAnalyser = vi.fn().mockReturnValue({
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn()
    })

    global.AudioContext = vi.fn(function () {
      return mockAudioContext
    }) as any
    global.OfflineAudioContext = vi.fn() as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should decode recorded audio and send to encoder', async () => {
    const client = { emit: vi.fn() } as any
    const { startRecording, stopRecording } = useAudioRecorder(client, mockSendToBackend)

    await startRecording()

    const blob = new Blob(['fake-audio'], { type: 'audio/webm' })
    mockMediaRecorder.ondataavailable({ data: blob })

    const stopPromise = stopRecording()
    mockMediaRecorder.onstop()
    await stopPromise

    expect(mockSendToBackend).toHaveBeenCalled()
    const payload = mockSendToBackend.mock.calls[0][0]
    expect(payload.type).toBe('user.speak')
    expect(payload.audioFormat).toBe('mp3')
    expect(payload.audioBase64).toBeDefined()
  })
})
