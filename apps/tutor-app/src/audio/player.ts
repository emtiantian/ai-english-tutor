import type { SpeakOptions, TTSSource } from '@ai-english-tutor/shared'

export type { TTSSource }

export interface AudioChunk {
  audioBase64: string
  format: string
  isEnd: boolean
}

/**
 * Dual-mode audio player:
 * - remote: Receives base64 audio chunks from backend, plays via AudioContext
 * - local: Uses browser speechSynthesis API
 *
 * iOS Safari notes:
 * - AudioContext starts "suspended" and must be resumed via user gesture
 * - speechSynthesis.speak() must be called within a user gesture context
 * - getVoices() returns empty on first call; voices load asynchronously
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private audioChunks: string[] = []
  private currentFormat = 'mp3'
  private isPlayingValue = false
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private _onStart?: () => void
  private _onEnd?: () => void
  private _onVolume?: (volume: number) => void
  private volumeInterval: ReturnType<typeof setInterval> | null = null
  /** Whether AudioContext has been unlocked by a user gesture (iOS requirement) */
  private audioUnlocked = false
  /** Cached voices for iOS async loading */
  private voices: SpeechSynthesisVoice[] = []

  constructor(private ttsSource: TTSSource = 'local') {
    // Pre-load voices asynchronously (iOS returns empty on first getVoices() call)
    if (this.synth) {
      this.voices = this.synth.getVoices()
      if (this.voices.length === 0) {
        this.synth.addEventListener('voiceschanged', () => {
          this.voices = this.synth!.getVoices()
        })
      }
    }
  }

  /**
   * Switch TTS source at runtime (e.g. after server config event).
   * Does not stop already-playing audio.
   */
  setTTSSource(source: TTSSource): void {
    this.ttsSource = source
  }

  get isPlaying(): boolean {
    return this.isPlayingValue
  }

  set onStart(fn: (() => void) | undefined) {
    this._onStart = fn
  }

  set onEnd(fn: (() => void) | undefined) {
    this._onEnd = fn
  }

  set onVolume(fn: ((volume: number) => void) | undefined) {
    this._onVolume = fn
  }

  /**
   * Unlock audio playback for iOS Safari.
   * MUST be called from a user gesture (tap/click) before any audio can play.
   */
  async unlockAudio(): Promise<void> {
    if (this.audioUnlocked) return
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    // Prime speechSynthesis (iOS needs at least one speak() in gesture context)
    if (this.synth) {
      const prime = new SpeechSynthesisUtterance('')
      prime.volume = 0
      this.synth.speak(prime)
      this.synth.cancel()
    }
    this.audioUnlocked = true
  }

  /**
   * Receive audio chunks from backend (remote mode only)
   */
  feedAudioChunk(chunk: AudioChunk): void {
    if (this.ttsSource !== 'remote') return

    this.audioChunks.push(chunk.audioBase64)
    this.currentFormat = chunk.format

    if (chunk.isEnd) {
      this.playRemoteAudio()
    }
  }

  /**
   * Unified speak interface — auto-selects remote or local based on config
   */
  async speak(text: string, options?: { audioChunks?: AudioChunk[]; lang?: string } & SpeakOptions): Promise<void> {
    if (this.ttsSource === 'remote' && options?.audioChunks) {
      for (const chunk of options.audioChunks) {
        this.feedAudioChunk(chunk)
      }
      return
    }

    return this.speakLocal(text, options)
  }

  stop(): void {
    this.stopVolumeDetection()
    // Don't close AudioContext — reuse it to avoid iOS unlock issues
    if (this.audioContext?.state === 'running') {
      this.audioContext.suspend()
    }
    this.synth?.cancel()
    this.currentUtterance = null
    this.isPlayingValue = false
    this.audioChunks = []
  }

  /**
   * Replay audio from base64 string (for "replay" button)
   */
  async replayAudio(audioBase64: string, format: string = 'mp3'): Promise<void> {
    if (!audioBase64) return
    this.stop()
    this.currentFormat = format
    this.audioChunks = [audioBase64]
    return this.playRemoteAudio()
  }

  // --- Internal: Remote audio playback ---
  private async playRemoteAudio(): Promise<void> {
    const fullBase64 = this.audioChunks.join('')
    this.audioChunks = []

    if (!fullBase64) return

    try {
      this.isPlayingValue = true
      this._onStart?.()

      // Reuse or create AudioContext; resume if suspended (iOS requirement)
      if (!this.audioContext) {
        this.audioContext = new AudioContext()
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }
      const arrayBuffer = base64ToArrayBuffer(fullBase64)
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)

      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer

      // 创建 AnalyserNode 用于实时音量检测（口型同步）
      const analyser = this.audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyser.connect(this.audioContext.destination)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      // 定期读取音量
      this.volumeInterval = setInterval(() => {
        if (!analyser) return
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        // 放大 1.8 倍让口型更明显，clamp 到 [0, 1]
        const volume = Math.min(average / 128 * 1.8, 1)
        this._onVolume?.(volume)
      }, 50) // 20fps

      source.onended = () => {
        this.stopVolumeDetection()
        this.isPlayingValue = false
        this._onVolume?.(0) // 播放结束，嘴巴闭上
        this._onEnd?.()
      }

      source.start()
    } catch (err) {
      console.error('[AudioPlayer] Failed to play remote audio:', err)
      this.stopVolumeDetection()
      this.isPlayingValue = false
      this._onEnd?.()
    }
  }

  // --- Internal: Local TTS via speechSynthesis ---
  private async speakLocal(text: string, options?: SpeakOptions & { lang?: string }): Promise<void> {
    if (!this.synth) return

    return new Promise((resolve) => {
      this.synth!.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      const lang = options?.lang ?? 'en-US'
      utterance.lang = lang
      if (options?.rate !== undefined) utterance.rate = options.rate
      if (options?.pitch !== undefined) utterance.pitch = options.pitch
      if (options?.volume !== undefined) utterance.volume = options.volume

      // Use cached voices (iOS getVoices() returns empty on first call)
      const voices = this.voices.length > 0 ? this.voices : this.synth!.getVoices()
      const langPrefix = lang.split('-')[0]
      const preferredVoice =
        langPrefix === 'zh'
          ? voices.find((v) => v.lang.startsWith('zh'))
          : voices.find((v) => v.lang.startsWith('en') && v.voiceURI.includes('Samantha')) ||
            voices.find((v) => v.lang.startsWith('en'))
      if (preferredVoice) utterance.voice = preferredVoice

      utterance.onstart = () => {
        this.isPlayingValue = true
        this._onStart?.()
        this.startLocalVolumeSimulation()
      }
      utterance.onend = () => {
        this.stopVolumeDetection()
        this.isPlayingValue = false
        this._onVolume?.(0)
        this._onEnd?.()
        resolve()
      }
      utterance.onerror = () => {
        this.stopVolumeDetection()
        this.isPlayingValue = false
        this._onVolume?.(0)
        this._onEnd?.()
        resolve()
      }

      this.currentUtterance = utterance
      this.synth!.speak(utterance)
    })
  }

  // --- Volume detection for lip-sync ---

  private stopVolumeDetection(): void {
    if (this.volumeInterval) {
      clearInterval(this.volumeInterval)
      this.volumeInterval = null
    }
  }

  /** 本地 TTS 没有真实音频流，用随机脉冲模拟嘴型 */
  private startLocalVolumeSimulation(): void {
    this.stopVolumeDetection()
    this.volumeInterval = setInterval(() => {
      // 生成 0.15~0.85 的随机音量，模拟说话节奏（口型更大）
      const volume = Math.random() * 0.7 + 0.15
      this._onVolume?.(volume)
    }, 80)
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
