import type { SpeakOptions, TTSSource } from '@ai-english-tutor/shared'
import { base64ToArrayBuffer, createVolumeMeter } from './utils.js'

export type { TTSSource }

export interface AudioChunk {
  audioBase64: string
  format: string
  isEnd: boolean
}

/**
 * 双模式音频播放器：
 * - remote：接收后端 base64 音频块，通过 AudioContext 播放
 * - local：使用浏览器 speechSynthesis API
 *
 * iOS Safari 注意：
 * - AudioContext 初始为 "suspended"，需要通过用户手势恢复
 * - speechSynthesis.speak() 必须在用户手势上下文中调用
 * - 首次调用 getVoices() 会返回空列表；语音列表异步加载
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private audioChunks: string[] = []
  private currentFormat = 'mp3'
  private isPlayingValue = false
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  private currentUtterance: SpeechSynthesisUtterance | null = null
  /** 当前正在播放的远程音频 source（abort 时用以真正停止，区别于 suspend 暂停） */
  private currentSource: AudioBufferSourceNode | null = null
  private fallbackAudio: HTMLAudioElement | null = null
  private fallbackAudioUrl: string | null = null
  /** abort 标志：抑制因 stop()/cancel() 间接触发的 onEnd 回调 */
  private aborted = false
  private _onStart?: () => void
  private _onEnd?: () => void
  private _onVolume?: (volume: number) => void
  private volumeMeterCleanup: (() => void) | null = null
  /** AudioContext 是否已通过用户手势解锁（iOS 要求） */
  private audioUnlocked = false
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
   * 为 iOS Safari 解锁音频播放。
   * 必须在任何音频播放前通过用户手势（点击/轻触）调用。
   */
  async unlockAudio(): Promise<void> {
    if (this.audioUnlocked) return
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    // 预热 speechSynthesis（iOS 需要在手势上下文中至少调用一次 speak()）
    if (this.synth) {
      const prime = new SpeechSynthesisUtterance('')
      prime.volume = 0
      this.synth.speak(prime)
      this.synth.cancel()
    }
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
    this.stopVolumeDetection()
    // 不要关闭 AudioContext — 复用它以避免 iOS 解锁问题
    if (this.audioContext?.state === 'running') {
      this.audioContext.suspend()
    }
    this.synth?.cancel()
    this.stopFallbackAudio()
    this.currentUtterance = null
    this.isPlayingValue = false
    this.audioChunks = []
  }

  /**
   * 打断当前播放（用户开口/发送新消息时调用）。
   *
   * 与 stop() 的区别：真正停止正在播放的 BufferSource（source.stop()）而非
   * suspend() 暂停，并标记 aborted 以抑制由 stop()/cancel() 间接触发的 onEnd
   * 回调，避免误触发“播放结束”逻辑（如延迟显示文本）。仅在有播放时标记 aborted，
   * 防止标志残留污染下一次正常播放的结束回调（新播放开始时也会复位 aborted）。
   */
  abort(): void {
    const wasPlaying = this.isPlayingValue
    this.stopVolumeDetection()
    try {
      this.currentSource?.stop()
    } catch {
      // source 可能已结束，忽略
    }
    this.currentSource = null
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

    try {
      this.isPlayingValue = true
      // 新播放开始，清除可能残留的 aborted 标志，避免误抑制本次结束回调
      this.aborted = false
      this._onStart?.()

      // 复用或创建 AudioContext；若处于 suspended 则恢复（iOS 要求）
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

      // 音量检测（口型同步）+ 输出到扬声器
      source.connect(this.audioContext.destination)
      this.volumeMeterCleanup = createVolumeMeter(
        source,
        volume => {
          this._onVolume?.(volume)
        },
        { multiplier: 1.8 }
      )

      this.currentSource = source
      source.onended = () => {
        this.stopVolumeDetection()
        this.currentSource = null
        this.isPlayingValue = false
        this._onVolume?.(0) // 播放结束，嘴巴闭上
        // abort 触发的结束不通知 onEnd，避免误触发“播放结束”逻辑（如延迟显示文本）
        if (this.aborted) {
          this.aborted = false
          return
        }
        this._onEnd?.()
      }

      source.start()
    } catch (err) {
      console.warn('[AudioPlayer] WebAudio 不可用，切换 HTMLAudio 播放:', err)
      this.stopVolumeDetection()
      await this.playFallbackAudio(fullBase64, this.currentFormat)
    }
  }

  private async playFallbackAudio(audioBase64: string, format: string): Promise<void> {
    this.stopFallbackAudio()
    const bytes = base64ToArrayBuffer(audioBase64)
    const mime = format === 'wav' ? 'audio/wav' : `audio/${format || 'mpeg'}`
    this.fallbackAudioUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
    const audio = new Audio(this.fallbackAudioUrl)
    this.fallbackAudio = audio
    audio.onended = () => {
      this.stopFallbackAudio()
      this.isPlayingValue = false
      this._onVolume?.(0)
      this._onEnd?.()
    }
    audio.onerror = () => {
      this.stopFallbackAudio()
      this.isPlayingValue = false
      this._onEnd?.()
    }
    this.isPlayingValue = true
    this._onStart?.()
    await audio.play()
  }

  private stopFallbackAudio(): void {
    this.fallbackAudio?.pause()
    this.fallbackAudio = null
    if (this.fallbackAudioUrl) URL.revokeObjectURL(this.fallbackAudioUrl)
    this.fallbackAudioUrl = null
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
