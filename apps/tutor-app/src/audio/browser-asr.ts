export interface BrowserASRResult {
  transcript: string
  confidence: number
}

export interface BrowserASROptions {
  lang?: string
  onInterim?: (transcript: string) => void
  signal?: AbortSignal
  stopSignal?: AbortSignal
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

interface SpeechRecognitionType {
  new (): SpeechRecognitionInstance
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: ((event: Event) => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionType
    webkitSpeechRecognition?: SpeechRecognitionType
  }
}

export function isBrowserASRSupported(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function recognizeSpeech(options: BrowserASROptions = {}): Promise<BrowserASRResult> {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognitionCtor) {
    return Promise.reject(new Error('当前浏览器不支持语音识别，请使用 Chrome、Edge 或 Safari。'))
  }

  const recognition = new SpeechRecognitionCtor()
  recognition.lang = options.lang ?? 'en-US'
  recognition.continuous = false
  recognition.interimResults = false
  recognition.maxAlternatives = 1

  return new Promise<BrowserASRResult>((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', cancel)
      options.stopSignal?.removeEventListener('abort', stop)
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      recognition.abort()
      reject(error)
    }
    const cancel = () => fail(new DOMException('录音已取消', 'AbortError'))
    const stop = () => {
      try {
        recognition.stop()
      } catch (error) {
        fail(error instanceof Error ? error : new Error('停止语音识别失败'))
      }
    }
    const timeout = setTimeout(() => fail(new Error('语音识别超时，请重试或使用文字输入。')), 60000)
    options.signal?.addEventListener('abort', cancel, { once: true })
    options.stopSignal?.addEventListener('abort', stop, { once: true })
    if (options.signal?.aborted) {
      cancel()
      return
    }

    recognition.onresult = event => {
      const result = event.results[0]?.[0]
      if (result?.transcript.trim() && !settled) {
        settled = true
        cleanup()
        recognition.stop()
        resolve({
          transcript: result.transcript,
          confidence: result.confidence ?? 0
        })
      }
    }

    recognition.onerror = event => {
      if (settled) return
      const messages: Record<string, string> = {
        'not-allowed': '麦克风或语音识别权限被拒绝，请检查浏览器网站权限。',
        'audio-capture': '无法使用麦克风，请检查输入设备。',
        network: '浏览器语音识别服务连接失败，请检查网络或改用文字输入。',
        'no-speech': '没有检测到讲话，请按住按钮说英语后再松开。'
      }
      fail(new Error(messages[event.error] ?? `语音识别失败: ${event.error}`))
    }

    recognition.onend = () => {
      if (settled) return
      fail(new Error('语音识别未返回任何结果，请重试。'))
    }

    try {
      recognition.start()
    } catch (error) {
      fail(error instanceof Error ? error : new Error('无法启动语音识别'))
    }
  })
}
