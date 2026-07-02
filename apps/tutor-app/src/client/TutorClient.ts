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
  WordExplanation,
} from './types'

export interface TutorClientOptions {
  baseUrl: string
  /** Unique session ID for this connection (used to scope SSE events) */
  sessionId: string
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  reconnectDelayMs?: number
  /** HTTP request timeout in milliseconds (default: 30000) */
  requestTimeoutMs?: number
}

export class TutorClient {
  private emitter = mitt<TutorEventMap>()
  private eventSource: EventSource | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private isDisposed = false
  private isConnectedValue = false

  constructor(private options: TutorClientOptions) {}

  // --- Connection Management ---
  connect(): void {
    if (this.isDisposed) this.isDisposed = false
    this.clearReconnect()
    // readyState: 0=connecting, 1=open, 2=closed
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

  // --- HTTP API ---
  async sendMessage(body: ChatRequestBody & { stream: true }, timeoutMs?: number): Promise<{ accepted: true }>
  async sendMessage(body: ChatRequestBody, timeoutMs?: number): Promise<ChatResponse>
  async sendMessage(
    body: ChatRequestBody,
    timeoutMs?: number,
  ): Promise<ChatResponse | { accepted: true }> {
    const result = await this.fetchJson<ChatResponse | { accepted: true }>('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: timeoutMs,
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

  // --- Vocabulary API ---
  async getVocabProgress(userId: string): Promise<VocabProgress> {
    return this.fetchJson(`/api/vocab/progress/${userId}`, { timeout: this.options.requestTimeoutMs ?? 15000 })
  }

  async getDueReviewWords(userId: string, limit = 10): Promise<ReviewWord[]> {
    const data = await this.fetchJson<{ dueCount: number; words: ReviewWord[] }>(
      `/api/vocab/review/due/${userId}?limit=${limit}`,
      { timeout: this.options.requestTimeoutMs ?? 15000 },
    )
    return data.words
  }

  async syncVocabulary(
    userId: string,
    words: VocabSyncItem[],
  ): Promise<{ success: boolean; synced: number }> {
    return this.fetchJson('/api/vocab/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, words }),
      timeout: 15000,
    })
  }

  async explainWord(word: string, sentence?: string): Promise<WordExplanation> {
    return this.fetchJson('/api/vocab/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sentence }),
      timeout: 30000,
    })
  }

  // --- Internal ---
  private async fetchJson<T>(
    path: string,
    init: RequestInit & { timeout?: number } = {},
  ): Promise<T> {
    const timeout = init.timeout ?? this.options.requestTimeoutMs ?? 30000
    try {
      const res = await fetchWithTimeout(`${this.options.baseUrl}${path}`, {
        ...init,
        timeout,
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
        throw new Error(`Request timeout after ${timeout}ms`)
      }
      throw err
    }
  }

  // --- Event System (mitt wrapper) ---
  on<K extends keyof TutorEventMap>(
    event: K,
    handler: (data: TutorEventMap[K]) => void,
  ): () => void {
    this.emitter.on(event, handler as any)
    return () => this.emitter.off(event, handler as any)
  }

  off<K extends keyof TutorEventMap>(
    event: K,
    handler: (data: TutorEventMap[K]) => void,
  ): void {
    this.emitter.off(event, handler as any)
  }

  emit<K extends keyof TutorEventMap>(event: K, data: TutorEventMap[K]): void {
    this.emitter.emit(event, data as any)
  }

  // --- Internal ---
  private setupEventSource(): void {
    // Close any existing connection before creating a new one
    this.eventSource?.close()

    const url = `${this.options.baseUrl}/api/chat/stream?sessionId=${encodeURIComponent(this.options.sessionId)}`
    const es = new EventSource(url)
    this.eventSource = es

    es.onopen = () => {
      this.isConnectedValue = true
      this.reconnectAttempt = 0
      this.emit('connected', undefined)
    }

    // Register all SSE event handlers
    const sseEvents = [
      'config',
      'teacher.response',
      'teacher.chunk',
      'teacher.audio',
      'level.result',
      'error',
      'heartbeat',
    ] as const

    for (const eventName of sseEvents) {
      es.addEventListener(eventName, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)

          // Emit the raw SSE event
          this.emit(eventName, data)

          // Emit derived events for specific cases
          if (eventName === 'teacher.response') {
            this.emit('message.assistant', data)
            // 注：state.idle 不再在这里自动触发，改为在 tts.start 时触发
            // 这样 "加载中" 状态会持续到语音开始播放
            if (data.vocabulary?.length) {
              this.emit('vocab.new', { words: data.vocabulary })
            }
          }
        } catch {
          // Silently ignore malformed SSE events
        }
      })
    }

    es.onerror = () => {
      // Stop the browser's own automatic reconnect so it doesn't race with our
      // controlled exponential-backoff reconnect loop.
      es.close()

      // When auto-reconnect is disabled, the error is terminal: report disconnect.
      if (this.options.autoReconnect === false) {
        this.isConnectedValue = false
        this.eventSource = null
        this.emit('disconnected', { reason: 'error' })
        return
      }

      // Don't flip isConnected to false immediately — treat this as a transient
      // error and only emit disconnected if we exhaust our retry budget.
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.isDisposed) return
    const opts = this.options
    if (opts.autoReconnect === false) return

    // Prevent multiple concurrent reconnection timers
    this.clearReconnect()

    const max = opts.maxReconnectAttempts ?? 5
    if (this.reconnectAttempt >= max) {
      this.isConnectedValue = false
      this.emit('disconnected', { reason: 'reconnect_exhausted' })
      this.emit('error', {
        code: 'RECONNECT_EXHAUSTED',
        message: 'Max reconnection attempts reached',
      })
      return
    }

    const baseDelay = opts.reconnectDelayMs ?? 3000
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempt), 30000)
    // Add random jitter (50%-100% of calculated delay) to prevent thundering herd
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
