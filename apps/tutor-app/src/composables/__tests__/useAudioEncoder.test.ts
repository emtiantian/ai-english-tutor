import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAudioEncoder } from '../useAudioEncoder'

describe('useAudioEncoder', () => {
  let mockWorker: {
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
    onmessage: ((event: MessageEvent) => void) | null
    onerror: ((error: ErrorEvent) => void) | null
  }
  let originalWorker: typeof Worker

  beforeEach(() => {
    originalWorker = global.Worker
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    }

    global.Worker = vi.fn(function () { return mockWorker }) as unknown as typeof Worker
  })

  afterEach(() => {
    global.Worker = originalWorker
    vi.clearAllMocks()
  })

  it('should create a module worker', () => {
    useAudioEncoder()
    expect(Worker).toHaveBeenCalledWith(
      expect.any(URL),
      { type: 'module' },
    )
  })

  it('should set isEncoding to true while encoding', () => {
    const { isEncoding, encode } = useAudioEncoder()
    const samples = new Float32Array([0, 0.5, -0.5])

    expect(isEncoding.value).toBe(false)
    encode(samples, 48000)
    expect(isEncoding.value).toBe(true)
  })

  it('should resolve with mp3 blob when worker succeeds', async () => {
    const { encode } = useAudioEncoder()
    const samples = new Float32Array([0, 0.5, -0.5])
    const promise = encode(samples, 48000)

    const postedMessage = mockWorker.postMessage.mock.calls[0][0]
    expect(postedMessage.id).toBeDefined()
    expect(postedMessage.samples).toBe(samples)
    expect(postedMessage.sampleRate).toBe(48000)

    const mp3Chunk = new Uint8Array([1, 2, 3])
    mockWorker.onmessage?.(
      new MessageEvent('message', {
        data: { id: postedMessage.id, mp3Chunks: [mp3Chunk] },
      }),
    )

    const result = await promise
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('audio/mp3')
  })

  it('should reject when worker returns an error', async () => {
    const { encode } = useAudioEncoder()
    const samples = new Float32Array([0])
    const promise = encode(samples, 48000)

    const postedMessage = mockWorker.postMessage.mock.calls[0][0]
    mockWorker.onmessage?.(
      new MessageEvent('message', {
        data: { id: postedMessage.id, error: 'Encoding failed' },
      }),
    )

    await expect(promise).rejects.toThrow('Encoding failed')
  })

  it('should set isEncoding to false after completion', async () => {
    const { isEncoding, encode } = useAudioEncoder()
    const samples = new Float32Array([0])
    const promise = encode(samples, 48000)
    const postedMessage = mockWorker.postMessage.mock.calls[0][0]

    mockWorker.onmessage?.(
      new MessageEvent('message', {
        data: { id: postedMessage.id, mp3Chunks: [new Uint8Array([1])] },
      }),
    )

    await promise
    expect(isEncoding.value).toBe(false)
  })
})
