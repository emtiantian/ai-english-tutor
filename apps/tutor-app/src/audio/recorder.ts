export interface AudioBlob {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface AudioRecorderOptions {
  maxDurationMs?: number
  mimeType?: string
  onVolume?: (volume: number) => void // 0-1，用于口型同步
}

/**
 * 浏览器录音器，支持实时音量检测。
 *
 * 使用原生 MediaRecorder API 录音，使用 Web Audio API
 *（AnalyserNode）进行音量计量。
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private volumeInterval: ReturnType<typeof setInterval> | null = null
  private startTime = 0
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null
  private pendingStop: { resolve: (value: AudioBlob) => void; reject: (reason?: unknown) => void } | null = null

  constructor(private options: AudioRecorderOptions = {}) {}

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }

  /**
   * 开始从麦克风录音。
   * 如果尚未获得权限，会请求权限。
   */
  async start(): Promise<void> {
    // 1. 获取麦克风权限
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    })

    // 2. 创建兼容 Safari 的 mimeType 的 MediaRecorder
    const finalMimeType = this.resolveMimeType()

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: finalMimeType })
    this.audioChunks = []
    this.startTime = Date.now()

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data)
    }

    this.mediaRecorder.start(100) // 每 100ms 收集一次

    // 3. 设置口型同步用的音量检测
    this.setupVolumeDetection()

    // 4. 设置最大录音时长限制
    const maxDuration = this.options.maxDurationMs ?? 30000
    this.maxDurationTimer = setTimeout(() => this.stop(), maxDuration)
  }

  /**
   * 停止录音并返回录制好的音频。
   */
  stop(): Promise<AudioBlob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.stream) {
        reject(new Error('Not recording'))
        return
      }

      this.pendingStop = { resolve, reject }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType ?? 'audio/webm'
        const blob = new Blob(this.audioChunks, { type: mimeType })
        const durationMs = Date.now() - this.startTime
        this.cleanup()
        this.pendingStop = null
        resolve({ blob, mimeType, durationMs })
      }

      this.mediaRecorder.stop()
      this.clearTimers()
    })
  }

  /**
   * 取消录音，不返回数据。
   *
   * 停止 MediaRecorder，然后在 onstop 回调中清理所有资源，
   * 避免与异步事件竞态。
   */
  cancel(): void {
    if (this.pendingStop) {
      this.pendingStop.reject(new Error('Recording cancelled'))
      this.pendingStop = null
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = () => {
        this.cleanup()
        this.clearTimers()
      }
      this.mediaRecorder.stop()
      return
    }
    this.cleanup()
    this.clearTimers()
  }

  // --- 内部 ---

  private setupVolumeDetection(): void {
    if (!this.stream) return

    this.audioContext = new AudioContext()
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 256
    source.connect(this.analyser)

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount)

    this.volumeInterval = setInterval(() => {
      if (!this.analyser) return
      this.analyser.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      // 放大 1.8 倍让口型更明显
      const volume = Math.min(average / 128 * 1.8, 1)
      this.options.onVolume?.(volume)
    }, 50) // 20fps
  }

  /**
   * 解析录音最佳支持的 mimeType。
   * Chrome/Firefox：audio/webm;codecs=opus
   * Safari：audio/mp4
   */
  private resolveMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/webm',
      '',
    ]
    return candidates.find((type) => !type || MediaRecorder.isTypeSupported(type)) ?? ''
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.audioContext?.close()
    this.audioContext = null
    this.analyser = null
    this.mediaRecorder = null
  }

  private clearTimers(): void {
    if (this.volumeInterval) clearInterval(this.volumeInterval)
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer)
    this.volumeInterval = null
    this.maxDurationTimer = null
  }
}
