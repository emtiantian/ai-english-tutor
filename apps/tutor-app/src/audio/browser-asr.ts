export interface BrowserASRResult {
  transcript: string
  confidence: number
}

export interface BrowserASROptions {
  lang?: string
  onInterim?: (transcript: string) => void
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

    recognition.onresult = event => {
      const result = event.results[0]?.[0]
      if (result) {
        settled = true
        resolve({
          transcript: result.transcript,
          confidence: result.confidence ?? 0
        })
      }
    }

    recognition.onerror = event => {
      if (settled) return
      settled = true
      reject(new Error(`语音识别失败: ${event.error}`))
    }

    recognition.onend = () => {
      if (settled) return
      settled = true
      reject(new Error('语音识别未返回任何结果，请重试。'))
    }

    recognition.start()
  })
}
