import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { config } from '@/config.js'
import { resolveCorsOrigin } from '@/sse/handler.js'

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
})
