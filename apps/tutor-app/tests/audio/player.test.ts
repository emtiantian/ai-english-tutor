import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AudioPlayer } from '../../src/audio/player.js'

describe('AudioPlayer', () => {
  let player: AudioPlayer

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    player?.stop()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
        this: HTMLMediaElement
      ) {
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      })
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
      vi.stubGlobal(
        'AudioContext',
        vi.fn(() => {
          throw new Error('Device failure')
        })
      )
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:test-audio'),
        revokeObjectURL: vi.fn()
      })

      global.atob = vi.fn().mockReturnValue('decoded') as any

      player = new AudioPlayer('remote')
    })

    it('primes a valid source without waiting for playback and reuses it for the opening', async () => {
      const audioElements: HTMLAudioElement[] = []
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
        this: HTMLAudioElement
      ) {
        audioElements.push(this)
        if (audioElements.length === 1) {
          expect(this.src).toMatch(/^data:audio\/wav/)
          return new Promise<void>(() => {})
        }
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      })
      await player.unlockAudio()
      player.feedAudioChunk({ audioBase64: 'chunk', format: 'wav', isEnd: true })
      await Promise.resolve()
      expect(audioElements).toHaveLength(2)
      expect(audioElements[1]).toBe(audioElements[0])
      expect(player.isPlaying).toBe(true)
      expect(AudioContext).not.toHaveBeenCalled()
    })

    it('reports rejected playback and clears playing state', async () => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'))
      const onError = vi.fn()
      player.onError = onError
      await player.replayAudio('chunk', 'wav')
      expect(player.isPlaying).toBe(false)
      expect(onError).toHaveBeenCalledOnce()
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
