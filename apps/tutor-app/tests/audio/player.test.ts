import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AudioPlayer } from '../../src/audio/player.js'

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
        onerror: null as any
      }

      global.speechSynthesis = {
        cancel: vi.fn(),
        speak: vi.fn((u: any) => {
          setTimeout(() => u.onstart?.(), 0)
          setTimeout(() => u.onend?.(), 10)
        }),
        getVoices: vi.fn().mockReturnValue([]),
        addEventListener: vi.fn()
      } as any

      global.SpeechSynthesisUtterance = vi.fn(function () {
        return mockUtterance
      }) as any
      player = new AudioPlayer('local')
    })

    it('should speak text using speechSynthesis', async () => {
      const onStart = vi.fn()
      const onEnd = vi.fn()
      player.onStart = onStart
      player.onEnd = onEnd

      player.speak('Hello world')
      await new Promise(r => setTimeout(r, 50))

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
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        context: null as any,
        onended: null as any
      }

      global.AudioContext = vi.fn().mockImplementation(function () {
        const ctx = {
          decodeAudioData: vi.fn().mockResolvedValue({ duration: 1 }),
          createBufferSource: vi.fn().mockReturnValue(mockBufferSource),
          createAnalyser: vi.fn().mockReturnValue({
            fftSize: 0,
            frequencyBinCount: 256,
            getByteFrequencyData: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn()
          }),
          destination: {},
          close: vi.fn()
        }
        mockBufferSource.context = ctx
        return ctx
      }) as any

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
      await new Promise(r => setTimeout(r, 10))

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
      await new Promise(r => setTimeout(r, 10))

      expect(onStart).toHaveBeenCalled()
    })

    it('should abort playback without triggering onEnd', async () => {
      const onStart = vi.fn()
      const onEnd = vi.fn()
      player.onStart = onStart
      player.onEnd = onEnd

      player.feedAudioChunk({ audioBase64: 'chunk', format: 'mp3', isEnd: true })
      await new Promise(r => setTimeout(r, 10))

      expect(player.isPlaying).toBe(true)

      player.abort()

      // abort 主动停止：播放状态清零，且不触发 onEnd（避免误触发“播放结束”逻辑）
      expect(player.isPlaying).toBe(false)
      expect(onEnd).not.toHaveBeenCalled()
    })
  })
})
