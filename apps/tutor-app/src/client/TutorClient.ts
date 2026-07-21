import mitt from 'mitt'
import { fetchWithTimeout } from '@ai-english-tutor/shared'
import type {
  TutorEventMap,
  TeachingResponse,
  ChatRequestBody,
  ChatResponse,
  VocabProgress,
  ReviewWord,
  VocabSyncItem,
  WordExplanation
} from './types'

export interface TutorClientOptions {
  baseUrl: string
  /** 本次连接的唯一 session ID（用于限定 SSE 事件作用域） */
  sessionId: string
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelayMs?: number
  /** HTTP 请求超时时间，单位毫秒（默认 30000） */
  requestTimeoutMs?: number
}

/**
 * 与后端通信的统一客户端：SSE 长连接 + HTTP 即发即忘双通道。
 *
 * - SSE 通道：GET /api/chat/stream?sessionId=... 建立长连接，接收服务端推送的
 *   teacher.chunk / teacher.response / teacher.audio / config 等事件。sessionId
 *   是 SSE 作用域键，前后端用同一个 connectionId，服务端据此定向广播。
 * - HTTP 通道：POST /api/chat 等「即发即忘」——请求立即返回 202 accepted，
 *   真正的回复随后通过 SSE 推回。因此 sendMessage(stream:true) 不会阻塞等 LLM。
 *
 * 事件系统用 mitt 做发布订阅：useTutorClient 订阅事件并驱动 Pinia store。
 * 断线时按指数退避 + 抖动自动重连，重试耗尽才上报 disconnected。
 */
export class TutorClient {
  private emitter = mitt<TutorEventMap>()
  private eventSource: EventSource | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private isDisposed = false
  private isConnectedValue = false

  constructor(private options: TutorClientOptions) {}

  // --- 连接管理 ---
  connect(): void {
    if (this.isDisposed) this.isDisposed = false
    this.clearReconnect()
    // readyState：0=连接中，1=已打开，2=已关闭
    const state = this.eventSource?.readyState
    if (state === 0 || state === 1) return
    this.setupEventSource()
  }

  disconnect(): void {
    this.isDisposed = true
    this.clearReconnect()
    this.eventSource?.close()
    this.eventSource = null
    this.isConnectedValue = false
  }

  get isConnected(): boolean {
    return this.isConnectedValue
  }

  // --- HTTP 接口 ---
  /**
   * 发送对话请求。stream=true 走「即发即忘」：后端立即返回 { accepted: true }，
   * 流式回复由 SSE 推送；stream=false 同步等待完整 ChatResponse。
   * 语音请求（带 audioBase64）建议传更长 timeoutMs（ASR+LLM+TTS 可能 30-60s）。
   */
  async sendMessage(
    body: ChatRequestBody & { stream: true },
    timeoutMs?: number
  ): Promise<{ accepted: true }>
  async sendMessage(body: ChatRequestBody, timeoutMs?: number): Promise<ChatResponse>
  async sendMessage(
    body: ChatRequestBody,
    timeoutMs?: number
  ): Promise<ChatResponse | { accepted: true }> {
    const result = await this.fetchJson<ChatResponse | { accepted: true }>('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: timeoutMs
    })

    if (body.stream) {
      if (!('accepted' in result)) {
        throw new Error('Unexpected non-streaming response for streaming request')
      }
      return result as { accepted: true }
    }

    if ('accepted' in result) {
      throw new Error('Unexpected streaming response for non-streaming request')
    }
    return result as ChatResponse
  }

  async getSession(sessionId: string): Promise<unknown> {
    return this.fetchJson(`/api/session/${sessionId}`)
  }

  // --- 词汇接口 ---
  async getVocabProgress(userId: string): Promise<VocabProgress> {
    return this.fetchJson(`/api/vocab/progress/${userId}`, {
      timeout: this.options.requestTimeoutMs ?? 15000
    })
  }

  async getDueReviewWords(userId: string, limit = 10): Promise<ReviewWord[]> {
    const data = await this.fetchJson<{ dueCount: number; words: ReviewWord[] }>(
      `/api/vocab/review/due/${userId}?limit=${limit}`,
      { timeout: this.options.requestTimeoutMs ?? 15000 }
    )
    return data.words
  }

  async syncVocabulary(
    userId: string,
    words: VocabSyncItem[]
  ): Promise<{ success: boolean; synced: number }> {
    return this.fetchJson('/api/vocab/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, words }),
      timeout: 15000
    })
  }

  async explainWord(word: string, sentence?: string): Promise<WordExplanation> {
    return this.fetchJson('/api/vocab/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sentence }),
      timeout: 30000
    })
  }

  // --- 内部方法 ---
  private async fetchJson<T>(
    path: string,
    init: RequestInit & { timeout?: number } = {}
  ): Promise<T> {
    const timeout = init.timeout ?? this.options.requestTimeoutMs ?? 30000
    try {
      const res = await fetchWithTimeout(`${this.options.baseUrl}${path}`, {
        ...init,
        timeout
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      return res.json().catch(() => {
        throw new Error('Invalid response from server')
      })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`, { cause: err })
      }
      throw err
    }
  }

  // --- 事件系统（mitt 包装） ---
  on<K extends keyof TutorEventMap>(
    event: K,
    handler: (data: TutorEventMap[K]) => void
  ): () => void {
    this.emitter.on(event, handler as any)
    return () => this.emitter.off(event, handler as any)
  }

  off<K extends keyof TutorEventMap>(event: K, handler: (data: TutorEventMap[K]) => void): void {
    this.emitter.off(event, handler as any)
  }

  emit<K extends keyof TutorEventMap>(event: K, data: TutorEventMap[K]): void {
    this.emitter.emit(event, data as any)
  }

  // --- 内部方法 ---
  private setupEventSource(): void {
    // 新建连接前关闭已有连接
    this.eventSource?.close()

    const url = `${this.options.baseUrl}/api/chat/stream?sessionId=${encodeURIComponent(this.options.sessionId)}`
    const es = new EventSource(url)
    this.eventSource = es

    es.onopen = () => {
      this.isConnectedValue = true
      this.reconnectAttempt = 0
      this.emit('connected', undefined)
    }

    // 注册所有 SSE 事件处理器
    const sseEvents = [
      'config',
      'teacher.response',
      'teacher.chunk',
      'teacher.audio',
      'error',
      'heartbeat'
    ] as const

    for (const eventName of sseEvents) {
      es.addEventListener(eventName, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)

          // 触发原始 SSE 事件
          this.emit(eventName, data)

          // teacher.response 除原始事件外，还派生出两个便利事件：
          // - message.assistant：本地 TTS 模式下触发音频播放（见 useAudioPlayback）
          // - vocab.new：抽出回复里的生词，供词汇面板/同步使用
          if (eventName === 'teacher.response') {
            this.emit('message.assistant', data)
            // isThinking 的重置由 useTutorClient 在 teacher.response 时显式完成，
            // 不再依赖 state.idle / tts 事件（二者已从事件链中移除）。
            if (data.vocabulary?.length) {
              this.emit('vocab.new', { words: data.vocabulary })
            }
          }
        } catch {
          // 静默忽略格式错误的 SSE 事件
        }
      })
    }

    es.onerror = () => {
      // 阻止浏览器自带的自动重连，避免与我们的
      // 受控指数退避重连循环产生竞态。
      es.close()

      // 自动重连关闭时，该错误是致命的：上报连接断开。
      if (this.options.autoReconnect === false) {
        this.isConnectedValue = false
        this.eventSource = null
        this.emit('disconnected', { reason: 'error' })
        return
      }

      // 不要立即把 isConnected 置为 false — 将其视为暂时性
      // 错误，只有在重试次数耗尽后才触发 disconnected。
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.isDisposed) return
    const opts = this.options
    if (opts.autoReconnect === false) return

    // 防止多个重连定时器并发运行
    this.clearReconnect()

    const max = opts.maxReconnectAttempts ?? 5
    if (this.reconnectAttempt >= max) {
      this.isConnectedValue = false
      this.emit('disconnected', { reason: 'reconnect_exhausted' })
      this.emit('error', {
        code: 'RECONNECT_EXHAUSTED',
        message: 'Max reconnection attempts reached'
      })
      return
    }

    const baseDelay = opts.reconnectDelayMs ?? 3000
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempt), 30000)
    // 添加随机抖动（计算延迟的 50%-100%），防止惊群效应
    const delay = Math.floor(exponentialDelay * (0.5 + Math.random() * 0.5))
    this.reconnectAttempt++

    this.emit('reconnecting', { attempt: this.reconnectAttempt, delayMs: delay })

    this.reconnectTimer = setTimeout(() => {
      this.setupEventSource()
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
