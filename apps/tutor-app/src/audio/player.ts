import type { SpeakOptions, TTSSource } from '@ai-english-tutor/shared'
import { base64ToArrayBuffer } from './utils.js'
import { audioDiagnostic } from './diagnostics.js'

export type { TTSSource }

export interface AudioChunk {
  audioBase64: string
  format: string
  isEnd: boolean
}

/**
 * 双模式音频播放器：
 * - remote：接收后端 base64 音频块，通过原生 Audio 元素播放
 * - local：使用浏览器 speechSynthesis API
 *
 * iOS Safari 注意：
 * - 通过用户手势预热同一个 Audio 元素
 * - speechSynthesis.speak() 必须在用户手势上下文中调用
 * - 首次调用 getVoices() 会返回空列表；语音列表异步加载
 */
export class AudioPlayer {
  private audioChunks: string[] = []
  private currentFormat = 'mp3'
  private isPlayingValue = false
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  private currentUtterance: SpeechSynthesisUtterance | null = null
  /** 跨回复复用已在用户手势中预热的原生播放器。 */
  private fallbackAudio: HTMLAudioElement | null = null
  private fallbackAudioUrl: string | null = null
  /** abort 标志：抑制因 stop()/cancel() 间接触发的 onEnd 回调 */
  private aborted = false
  private _onError?: (error: Error) => void
  private _onStart?: () => void
  private _onEnd?: () => void
  private _onVolume?: (volume: number) => void
  private volumeMeterCleanup: (() => void) | null = null
  /** 是否已尝试通过用户手势预热。 */
  private audioUnlocked = false
  private diagnosticTimer: ReturnType<typeof setTimeout> | undefined

  private trace(stage: string, extra: Record<string, unknown> = {}): void {
    const audio = this.fallbackAudio
    audioDiagnostic(stage, {
      source: this.ttsSource,
      secureContext: window.isSecureContext,
      protocol: window.location.protocol,
      userActive: navigator.userActivation?.isActive,
      userHasInteracted: navigator.userActivation?.hasBeenActive,
      visibility: document.visibilityState,
      paused: audio?.paused,
      muted: audio?.muted,
      volume: audio?.volume,
      readyState: audio?.readyState,
      networkState: audio?.networkState,
      currentTime: audio?.currentTime,
      duration: audio?.duration,
      buffered: audio
        ? Array.from({ length: audio.buffered.length }, (_, i) => ({
            start: audio.buffered.start(i),
            end: audio.buffered.end(i)
          }))
        : [],
      mediaErrorCode: audio?.error?.code,
      mediaErrorMessage: audio?.error?.message,
      ...extra
    })
  }
  /** 为 iOS 异步加载缓存的语音列表 */
  private voices: SpeechSynthesisVoice[] = []

  constructor(private ttsSource: TTSSource = 'local') {
    // 异步预加载语音列表（iOS 首次 getVoices() 返回空）
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
   * 在运行时切换 TTS 来源（例如收到服务端配置事件后）。
   * 不会停止已在播放的音频。
   */
  setTTSSource(source: TTSSource): void {
    this.ttsSource = source
    this.trace('source.configured')
  }

  get isPlaying(): boolean {
    return this.isPlayingValue
  }

  set onError(fn: ((error: Error) => void) | undefined) {
    this._onError = fn
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
   * 为 iOS Safari 解锁音频播放。
   * 必须在任何音频播放前通过用户手势（点击/轻触）调用。
   */
  async unlockAudio(): Promise<void> {
    if (this.audioUnlocked) return
    const audio = this.fallbackAudio ?? new Audio()
    this.fallbackAudio = audio
    // A valid silent WAV primes the same element in the user gesture.
    // Never block lesson.start on device initialization.
    audio.src =
      'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA=='
    this.trace('unlock.request')
    void audio.play().then(
      () => this.trace('unlock.resolved'),
      error => this.trace('unlock.rejected', { name: error?.name, message: error?.message })
    )
    this.audioUnlocked = true
  }

  /**
   * 从后端接收音频块（仅 remote 模式）
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
   * 统一的 speak 接口 — 根据配置自动选择 remote 或 local
   */
  async speak(
    text: string,
    options?: { audioChunks?: AudioChunk[]; lang?: string } & SpeakOptions
  ): Promise<void> {
    if (this.ttsSource === 'remote' && options?.audioChunks) {
      for (const chunk of options.audioChunks) {
        this.feedAudioChunk(chunk)
      }
      return
    }

    return this.speakLocal(text, options)
  }

  stop(): void {
    this.trace('play.stop')
    this.stopVolumeDetection()
    this.synth?.cancel()
    this.stopFallbackAudio()
    this.currentUtterance = null
    this.isPlayingValue = false
    this.audioChunks = []
  }

  /**
   * 打断当前播放（用户开口/发送新消息时调用）。
   *
   * 标记 aborted 以抑制由 stop()/cancel() 间接触发的 onEnd
   * 回调，避免误触发“播放结束”逻辑（如延迟显示文本）。仅在有播放时标记 aborted，
   * 防止标志残留污染下一次正常播放的结束回调（新播放开始时也会复位 aborted）。
   */
  abort(): void {
    this.trace('play.abort')
    const wasPlaying = this.isPlayingValue
    this.stopVolumeDetection()
    this.synth?.cancel()
    this.stopFallbackAudio()
    this.currentUtterance = null
    this.audioChunks = []
    this.isPlayingValue = false
    if (wasPlaying) {
      this.aborted = true
    }
  }

  /**
   * 通过 base64 字符串重放音频（用于“重听”按钮）
   */
  async replayAudio(audioBase64: string, format: string = 'mp3'): Promise<void> {
    this.trace('replay.request', { base64Length: audioBase64.length, format })
    if (!audioBase64) return
    this.stop()
    this.currentFormat = format
    this.audioChunks = [audioBase64]
    return this.playRemoteAudio()
  }

  // --- 内部：远程音频播放 ---
  private async playRemoteAudio(): Promise<void> {
    const fullBase64 = this.audioChunks.join('')
    this.audioChunks = []

    if (!fullBase64) return

    this.aborted = false
    try {
      await this.playFallbackAudio(fullBase64, this.currentFormat)
    } catch (error) {
      this.trace('play.rejected', {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error)
      })
      this.stopFallbackAudio()
      this.isPlayingValue = false
      this._onEnd?.()
      this._onError?.(error instanceof Error ? error : new Error('音频播放失败'))
    }
  }

  private async playFallbackAudio(audioBase64: string, format: string): Promise<void> {
    this.stopFallbackAudio()
    const bytes = base64ToArrayBuffer(audioBase64)
    const header = String.fromCharCode(...new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength)))
    // Stored messages from earlier versions omitted the format. Trust the WAV
    // header rather than incorrectly labelling a replay as MPEG.
    const isWav = header.startsWith('RIFF') && header.endsWith('WAVE')
    const mime =
      isWav || format === 'wav'
        ? 'audio/wav'
        : `audio/${format === 'mp3' ? 'mpeg' : format || 'mpeg'}`
    this.fallbackAudioUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const audio = this.fallbackAudio ?? new Audio()
    audio.src = this.fallbackAudioUrl
    audio.preload = 'auto'
    audio.muted = false
    this.fallbackAudio = audio
    this.trace('play.request', {
      bytes: bytes.byteLength,
      format,
      mime,
      isWav,
      riffBytes: isWav ? new DataView(bytes).getUint32(4, true) + 8 : undefined,
      supported: audio.canPlayType(mime)
    })
    audio.onloadedmetadata = () => this.trace('media.loadedmetadata')
    audio.oncanplay = () => this.trace('media.canplay')
    audio.onwaiting = () => this.trace('media.waiting')
    audio.onstalled = () => {
      this.trace('media.stalled')
      this.showDiagnosticControls(audio)
    }
    audio.onended = () => {
      this.trace('media.ended')
      this.stopFallbackAudio()
      this.isPlayingValue = false
      this._onVolume?.(0)
      this._onEnd?.()
    }
    audio.onerror = () => {
      this.trace('media.error')
      this.stopFallbackAudio()
      this.isPlayingValue = false
      this._onEnd?.()
      this._onError?.(new Error('音频设备或音频解码失败'))
    }
    audio.onplaying = () => {
      this.trace('media.playing')
      this.isPlayingValue = true
      this._onStart?.()
      this.startLocalVolumeSimulation()
    }
    this.diagnosticTimer = setTimeout(() => {
      this.trace('play.after2s')
      if (audio.currentTime === 0) this.showDiagnosticControls(audio)
    }, 2000)
    await audio.play()
    this.trace('play.resolved')
  }

  private stopFallbackAudio(): void {
    clearTimeout(this.diagnosticTimer)
    if (this.fallbackAudio) {
      this.fallbackAudio.onended = null
      this.fallbackAudio.onerror = null
      this.fallbackAudio.onplaying = null
      this.fallbackAudio.onloadedmetadata = null
      this.fallbackAudio.oncanplay = null
      this.fallbackAudio.onwaiting = null
      this.fallbackAudio.onstalled = null
      this.fallbackAudio.pause()
      this.fallbackAudio.removeAttribute('src')
      this.fallbackAudio.remove()
    }
    this.stopVolumeDetection()
    if (this.fallbackAudioUrl) URL.revokeObjectURL(this.fallbackAudioUrl)
    this.fallbackAudioUrl = null
  }

  /** Expose native controls only while diagnosing a stalled local playback. */
  private showDiagnosticControls(audio: HTMLAudioElement): void {
    if (!import.meta.env.DEV || audio.isConnected) return
    audio.controls = true
    audio.setAttribute('aria-label', '语音诊断：浏览器原生播放器')
    audio.style.cssText = 'position:fixed;left:16px;top:16px;z-index:9999;width:300px'
    document.body.append(audio)
    this.trace('diagnostic.controls-visible')
  }

  // --- 内部：通过 speechSynthesis 播放本地 TTS ---
  private async speakLocal(
    text: string,
    options?: SpeakOptions & { lang?: string }
  ): Promise<void> {
    if (!this.synth) return

    return new Promise(resolve => {
      this.synth!.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      const lang = options?.lang ?? 'en-US'
      utterance.lang = lang
      if (options?.rate !== undefined) utterance.rate = options.rate
      if (options?.pitch !== undefined) utterance.pitch = options.pitch
      if (options?.volume !== undefined) utterance.volume = options.volume

      // 使用缓存的语音列表（iOS 首次 getVoices() 返回空）
      const voices = this.voices.length > 0 ? this.voices : this.synth!.getVoices()
      const langPrefix = lang.split('-')[0]
      const preferredVoice =
        langPrefix === 'zh'
          ? voices.find(v => v.lang.startsWith('zh'))
          : voices.find(v => v.lang.startsWith('en') && v.voiceURI.includes('Samantha')) ||
            voices.find(v => v.lang.startsWith('en'))
      if (preferredVoice) utterance.voice = preferredVoice

      utterance.onstart = () => {
        this.isPlayingValue = true
        // 新播放开始，清除可能残留的 aborted 标志
        this.aborted = false
        this._onStart?.()
        this.startLocalVolumeSimulation()
      }
      utterance.onend = () => {
        this.stopVolumeDetection()
        this.isPlayingValue = false
        this._onVolume?.(0)
        // abort 触发的结束不通知 onEnd
        if (this.aborted) {
          this.aborted = false
          resolve()
          return
        }
        this._onEnd?.()
        resolve()
      }
      utterance.onerror = () => {
        this.stopVolumeDetection()
        this.isPlayingValue = false
        this._onVolume?.(0)
        // abort 触发的取消不通知 onEnd
        if (this.aborted) {
          this.aborted = false
          resolve()
          return
        }
        this._onEnd?.()
        resolve()
      }

      this.currentUtterance = utterance
      this.synth!.speak(utterance)
    })
  }

  // --- 音量检测（用于口型同步） ---

  private stopVolumeDetection(): void {
    this.volumeMeterCleanup?.()
    this.volumeMeterCleanup = null
  }

  /** 本地 TTS 没有真实音频流，用随机脉冲模拟嘴型 */
  private startLocalVolumeSimulation(): void {
    this.stopVolumeDetection()
    const interval = setInterval(() => {
      // 生成 0.15~0.85 的随机音量，模拟说话节奏（口型更大）
      const volume = Math.random() * 0.7 + 0.15
      this._onVolume?.(volume)
    }, 80)
    this.volumeMeterCleanup = () => clearInterval(interval)
  }
}
