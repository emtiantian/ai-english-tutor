/**
 * 音频通用工具函数
 * 纯浏览器 API，无业务依赖
 */

/**
 * 将 Blob 转为 base64 字符串（不含 data URL 前缀）
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 将 base64 字符串转为 ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * 将 base64 字符串转为 Blob
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteString = atob(base64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

/**
 * 将音频 Blob 解码为单声道 PCM 采样（在主线程执行）
 */
export async function decodeToMonoPcm(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const audioContext = new AudioContext()
  let onAbort: (() => void) | undefined

  try {
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    onAbort = () => {
      audioContext.close().catch(() => {})
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const arrayBuffer = await blob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(arrayBuffer)
    const channelData = decoded.getChannelData(0)
    return { samples: new Float32Array(channelData), sampleRate: decoded.sampleRate }
  } finally {
    if (onAbort) {
      signal?.removeEventListener('abort', onAbort)
    }
    await audioContext.close()
  }
}

/**
 * 解析录音最佳支持的 mimeType。
 * Chrome/Firefox：audio/webm;codecs=opus
 * Safari：audio/mp4
 */
export function resolveRecorderMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm',
    '',
  ]
  return candidates.find((type) => !type || MediaRecorder.isTypeSupported(type)) ?? ''
}

/**
 * 检测 base64 是否带有 data URL 前缀，并返回纯净的 base64 和 mimeType
 */
export function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!match) return null
  return { mimeType: match[1], base64: match[2] }
}

export interface VolumeMeterOptions {
  /** FFT 大小，默认 256 */
  fftSize?: number
  /** 音量放大倍数，默认 1.8 */
  multiplier?: number
  /** 采样间隔 ms，默认 100（人对口型延迟不敏感，降低频率可减少 CPU 占用） */
  intervalMs?: number
}

/**
 * 创建音量检测器，返回清理函数。
 *
 * 适用于录音音量检测和播放音量检测（口型同步）。
 */
export function createVolumeMeter(
  source: AudioNode,
  onVolume: (volume: number) => void,
  options: VolumeMeterOptions = {},
): () => void {
  const audioContext = source.context
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = options.fftSize ?? 256
  source.connect(analyser)

  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  const multiplier = options.multiplier ?? 1.8
  const intervalMs = options.intervalMs ?? 100

  const interval = setInterval(() => {
    analyser.getByteFrequencyData(dataArray)
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
    const volume = Math.min(average / 128 * multiplier, 1)
    onVolume(volume)
  }, intervalMs)

  return () => {
    clearInterval(interval)
    try {
      source.disconnect(analyser)
    } catch {
      // ignore
    }
  }
}
