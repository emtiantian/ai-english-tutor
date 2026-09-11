// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TutorClient } from '../../src/client/TutorClient.js'

// 模拟 EventSource
global.EventSource = vi.fn() as any

describe('TutorClient', () => {
  let client: TutorClient
  let mockES: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockES = {
      close: vi.fn(),
      addEventListener: vi.fn(),
      onopen: null as any,
      onerror: null as any,
      readyState: 0
    }

    const MockES = vi.fn(function () {
      return mockES
    } as any)
    MockES.OPEN = 1
    global.EventSource = MockES as any

    client = new TutorClient({
      baseUrl: 'http://localhost:3000',
      sessionId: 'test-session',
      autoReconnect: false
    })
  })

  afterEach(() => {
    client.disconnect()
  })

  describe('connect', () => {
    it('should create EventSource with correct URL', () => {
      client.connect()
      expect(global.EventSource).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat/stream?sessionId=test-session'
      )
    })

    it('should emit connected event on open', () => {
      const handler = vi.fn()
      client.on('connected', handler)

      client.connect()
      mockES.onopen()

      expect(handler).toHaveBeenCalledWith(undefined)
      expect(client.isConnected).toBe(true)
    })

    it('should emit disconnected on error when autoReconnect is false', () => {
      const handler = vi.fn()
      client.on('disconnected', handler)

      client.connect()
      mockES.onerror()

      expect(handler).toHaveBeenCalledWith({ reason: 'error' })
      expect(client.isConnected).toBe(false)
    })
  })

  describe('sendMessage', () => {
    it('should POST to /api/chat with correct body', async () => {
      const mockResponse = {
        accepted: true
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.sendMessage({
        type: 'user.speak',
        text: 'Hi',
        level: 3,
        stream: true
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'user.speak',
            text: 'Hi',
            level: 3,
            stream: true
          })
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('should throw on HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' })
      })

      await expect(client.sendMessage({ type: 'user.speak', text: 'Hi' })).rejects.toThrow(
        'Server error'
      )
    })
  })

  describe('SSE events', () => {
    it('should emit teacher.response when SSE event arrives', () => {
      const handler = vi.fn()
      client.on('teacher.response', handler)

      client.connect()

      const eventHandler = mockES.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'teacher.response'
      )?.[1]

      eventHandler({ data: JSON.stringify({ text: 'Hello', motionId: 'wave' }) })

      expect(handler).toHaveBeenCalledWith({ text: 'Hello', motionId: 'wave' })
    })

    it('should emit teacher.chunk when streaming chunk arrives', () => {
      const handler = vi.fn()
      client.on('teacher.chunk', handler)

      client.connect()

      const eventHandler = mockES.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'teacher.chunk'
      )?.[1]

      eventHandler({ data: JSON.stringify({ chunk: 'Hello', isEnd: false }) })

      expect(handler).toHaveBeenCalledWith({ chunk: 'Hello', isEnd: false })
    })

    it('should ignore events from an interrupted older request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accepted: true })
      })
      await client.sendMessage({
        type: 'user.speak',
        text: 'new turn',
        stream: true,
        requestId: 'request-new'
      })

      const handler = vi.fn()
      client.on('teacher.chunk', handler)
      client.connect()
      const eventHandler = mockES.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'teacher.chunk'
      )?.[1]

      eventHandler({
        data: JSON.stringify({ chunk: 'old', isEnd: false, requestId: 'request-old' })
      })
      eventHandler({
        data: JSON.stringify({ chunk: 'new', isEnd: false, requestId: 'request-new' })
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({
        chunk: 'new',
        isEnd: false,
        requestId: 'request-new'
      })
    })

    it('should emit message.assistant on teacher.response', () => {
      const handler = vi.fn()
      client.on('message.assistant', handler)

      client.connect()

      const eventHandler = mockES.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'teacher.response'
      )?.[1]

      eventHandler({ data: JSON.stringify({ text: 'Hello' }) })

      expect(handler).toHaveBeenCalledWith({ text: 'Hello' })
    })

    it('should emit vocab.new on teacher.response with vocabulary', () => {
      const handler = vi.fn()
      client.on('vocab.new', handler)

      client.connect()

      const eventHandler = mockES.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'teacher.response'
      )?.[1]

      eventHandler({ data: JSON.stringify({ text: 'Hello', vocabulary: ['hello'] }) })

      expect(handler).toHaveBeenCalledWith({ words: ['hello'] })
    })
  })

  describe('reconnection', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should reconnect with exponential backoff', () => {
      vi.spyOn(Math, 'random').mockReturnValue(1)

      client = new TutorClient({
        baseUrl: 'http://localhost:3000',
        sessionId: 'test-session',
        autoReconnect: true,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 1000
      })

      const reconnectingHandler = vi.fn()
      client.on('reconnecting', reconnectingHandler)

      client.connect()

      // 第一次错误触发重连
      mockES.onerror()
      expect(reconnectingHandler).toHaveBeenCalledWith({ attempt: 1, delayMs: 1000 })

      // 快进越过第一次延迟
      vi.advanceTimersByTime(1000)
      expect(global.EventSource).toHaveBeenCalledTimes(2)

      // 第二次错误
      mockES.onerror()
      expect(reconnectingHandler).toHaveBeenCalledWith({ attempt: 2, delayMs: 2000 })

      // 第三次错误超过上限
      vi.advanceTimersByTime(2000)
      mockES.onerror()
      vi.advanceTimersByTime(4000)

      const errorHandler = vi.fn()
      client.on('error', errorHandler)
      mockES.onerror()
      expect(errorHandler).toHaveBeenCalledWith({
        code: 'RECONNECT_EXHAUSTED',
        message: 'Max reconnection attempts reached'
      })
    })
  })
})
