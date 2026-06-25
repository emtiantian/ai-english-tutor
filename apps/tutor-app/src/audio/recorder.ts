export interface AudioBlob {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface AudioRecorderOptions {
  maxDurationMs?: number
  mimeType?: string
  onVolume?: (volume: number) => void // 0-1, for lip-sync
}

/**
 * Browser audio recorder with real-time volume detection.
 *
 * Uses native MediaRecorder API for recording and Web Audio API
 * (AnalyserNode) for volume metering.
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
   * Start recording audio from microphone.
   * Requests permission if not already granted.
   */
  async start(): Promise<void> {
    // 1. Get microphone permission
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    })

    // 2. Create MediaRecorder with Safari-compatible mimeType
    const finalMimeType = this.resolveMimeType()

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: finalMimeType })
    this.audioChunks = []
    this.startTime = Date.now()

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data)
    }

    this.mediaRecorder.start(100) // Collect every 100ms

    // 3. Set up volume detection for lip-sync
    this.setupVolumeDetection()

    // 4. Set max duration limit
    const maxDuration = this.options.maxDurationMs ?? 30000
    this.maxDurationTimer = setTimeout(() => this.stop(), maxDuration)
  }

  /**
   * Stop recording and return the recorded audio.
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
   * Cancel recording without returning data.
   *
   * Stops the MediaRecorder, then cleans up all resources in the onstop
   * handler so we don't race with the async event.
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

  // --- Internal ---

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
   * Resolve the best supported mimeType for recording.
   * Chrome/Firefox: audio/webm;codecs=opus
   * Safari: audio/mp4
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
