import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { config } from '@/config.js'
import { interruptSession, onSessionDisconnect, resolveCorsOrigin } from '@/sse/handler.js'

describe('resolveCorsOrigin', () => {
  let originalOrigins: string[]

  beforeEach(() => {
    originalOrigins = [...config.CORS_ORIGIN]
  })

  afterEach(() => {
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push(...originalOrigins)
  })

  it('echoes request origin in wildcard mode', () => {
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('*')
    expect(resolveCorsOrigin('http://evil.example.com')).toBe('http://evil.example.com')
    expect(resolveCorsOrigin(undefined)).toBe('*')
  })

  it('echoes allowed origins in whitelist mode', () => {
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('http://localhost:5173', 'http://localhost:4173')
    expect(resolveCorsOrigin('http://localhost:5173')).toBe('http://localhost:5173')
    expect(resolveCorsOrigin('http://localhost:4173')).toBe('http://localhost:4173')
  })

  it('falls back to first configured origin when request origin is missing', () => {
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('http://localhost:5173', 'http://localhost:4173')
    expect(resolveCorsOrigin(undefined)).toBe('http://localhost:5173')
  })

  it('returns boolean false for blocked origins', () => {
    config.CORS_ORIGIN.length = 0
    config.CORS_ORIGIN.push('http://localhost:5173', 'http://localhost:4173')
    const blocked = resolveCorsOrigin('http://evil.example.com')
    expect(blocked).toBe(false)
    expect(blocked).not.toBe('false')
  })

  it('removes an empty disconnect listener set when a request completes', () => {
    const listener = vi.fn()
    const unsubscribe = onSessionDisconnect('completed-request', listener)

    unsubscribe()

    expect(interruptSession('completed-request')).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('interrupts only the requested generation', () => {
    const oldRequest = vi.fn()
    const newRequest = vi.fn()
    onSessionDisconnect('shared-session', oldRequest, 'request-old')
    const unsubscribeNew = onSessionDisconnect('shared-session', newRequest, 'request-new')

    expect(interruptSession('shared-session', 'request-old')).toBe(true)
    expect(oldRequest).toHaveBeenCalledOnce()
    expect(newRequest).not.toHaveBeenCalled()

    unsubscribeNew()
  })
})
