import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AudioPlayer } from '../player'

describe('AudioPlayer', () => {
  let player: AudioPlayer

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    player?.stop()
  })

  describe('local TTS mode', () => {
    beforeEach(() => {
      const mockUtterance = {
        onstart: null as any,
        onend: null as any,
        onerror: null as any,
      }

      global.speechSynthesis = {
        cancel: vi.fn(),
        speak: vi.fn((u: any) => {
          setTimeout(() => u.onstart?.(), 0)
          setTimeout(() => u.onend?.(), 10)
        }),
        getVoices: vi.fn().mockReturnValue([]),
        addEventListener: vi.fn(),
      } as any

      global.SpeechSynthesisUtterance = vi.fn(function () { return mockUtterance }) as any
      player = new AudioPlayer('local')
    })

    it('should speak text using speechSynthesis', async () => {
      const onStart = vi.fn()
      const onEnd = vi.fn()
      player.onStart = onStart
      player.onEnd = onEnd

      player.speak('Hello world')
      await new Promise((r) => setTimeout(r, 50))

      expect(global.speechSynthesis!.speak).toHaveBeenCalled()
      expect(onStart).toHaveBeenCalled()
      expect(onEnd).toHaveBeenCalled()
    })

    it('should stop speaking', () => {
      player.stop()
      expect(global.speechSynthesis!.cancel).toHaveBeenCalled()
    })
  })

  describe('remote TTS mode', () => {
    beforeEach(() => {
      const mockBufferSource = {
        connect: vi.fn(),
        start: vi.fn(),
        onended: null as any,
      }

      global.AudioContext = vi.fn().mockImplementation(() => ({
        decodeAudioData: vi.fn().mockResolvedValue({ duration: 1 }),
        createBufferSource: vi.fn().mockReturnValue(mockBufferSource),
        destination: {},
        close: vi.fn(),
      })) as any

      global.atob = vi.fn().mockReturnValue('decoded') as any

      player = new AudioPlayer('remote')
    })

    it('should accumulate audio chunks and play when isEnd=true', async () => {
      const onStart = vi.fn()
      const onEnd = vi.fn()
      player.onStart = onStart
      player.onEnd = onEnd

      player.feedAudioChunk({ audioBase64: 'chunk1', format: 'mp3', isEnd: false })
      expect(player.isPlaying).toBe(false)

      player.feedAudioChunk({ audioBase64: 'chunk2', format: 'mp3', isEnd: true })
      await new Promise((r) => setTimeout(r, 10))

      expect(onStart).toHaveBeenCalled()
    })

    it('should ignore chunks when in local mode', () => {
      player = new AudioPlayer('local')
      player.feedAudioChunk({ audioBase64: 'chunk', format: 'mp3', isEnd: true })
      expect(player.isPlaying).toBe(false)
    })

    it('should play chunks after switching from local to remote', async () => {
      player = new AudioPlayer('local')
      const onStart = vi.fn()
      player.onStart = onStart

      player.setTTSSource('remote')
      player.feedAudioChunk({ audioBase64: 'chunk', format: 'mp3', isEnd: true })
      await new Promise((r) => setTimeout(r, 10))

      expect(onStart).toHaveBeenCalled()
    })
  })
})
