import { describe, it, expect } from 'vitest'
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError
} from 'openai'
import { normalizeLLMError, isLLMError } from '@/ai/llm/errors.js'

describe('normalizeLLMError', () => {
  it('401 -> auth（不可重试）', () => {
    const err = new AuthenticationError(401, undefined, 'bad key', undefined)
    const n = normalizeLLMError(err)
    expect(n.code).toBe('auth')
    expect(n.retryable).toBe(false)
    expect(n.status).toBe(401)
    expect(isLLMError(n)).toBe(true)
  })

  it('403 -> auth', () => {
    const err = new PermissionDeniedError(403, undefined, 'forbidden', undefined)
    expect(normalizeLLMError(err).code).toBe('auth')
  })

  it('429 -> rate-limit（可重试）', () => {
    const err = new RateLimitError(429, undefined, 'rate limited', undefined)
    const n = normalizeLLMError(err)
    expect(n.code).toBe('rate-limit')
    expect(n.retryable).toBe(true)
    expect(n.status).toBe(429)
  })

  it('400 -> bad-request（不可重试）', () => {
    const err = new BadRequestError(400, undefined, 'bad request', undefined)
    const n = normalizeLLMError(err)
    expect(n.code).toBe('bad-request')
    expect(n.retryable).toBe(false)
  })

  it('404 -> bad-request', () => {
    const err = new NotFoundError(404, undefined, 'not found', undefined)
    expect(normalizeLLMError(err).code).toBe('bad-request')
  })

  it('500 -> server（可重试）', () => {
    const err = new InternalServerError(500, undefined, 'internal', undefined)
    const n = normalizeLLMError(err)
    expect(n.code).toBe('server')
    expect(n.retryable).toBe(true)
    expect(n.status).toBe(500)
  })

  it('503 -> server', () => {
    const err = new InternalServerError(503, undefined, 'unavailable', undefined)
    expect(normalizeLLMError(err).code).toBe('server')
  })

  it('APIConnectionTimeoutError -> timeout（可重试）', () => {
    const err = new APIConnectionTimeoutError({ message: 'request timed out' })
    const n = normalizeLLMError(err)
    expect(n.code).toBe('timeout')
    expect(n.retryable).toBe(true)
  })

  it('APIConnectionError -> network（可重试）', () => {
    const err = new APIConnectionError({ message: 'connection error' })
    const n = normalizeLLMError(err)
    expect(n.code).toBe('network')
    expect(n.retryable).toBe(true)
  })

  it('APIUserAbortError -> abort（不可重试）', () => {
    const err = new APIUserAbortError({ message: 'aborted' })
    const n = normalizeLLMError(err)
    expect(n.code).toBe('abort')
    expect(n.retryable).toBe(false)
  })

  it("message='AbortError' 的普通 Error -> abort（向后兼容）", () => {
    // Provider 内部手动 throw new Error('AbortError') 的归一化路径
    const err = new Error('AbortError')
    const n = normalizeLLMError(err)
    expect(n.code).toBe('abort')
    expect(n.retryable).toBe(false)
    expect(n.message).toBe('AbortError')
  })

  it("name='AbortError' 的 Error -> abort", () => {
    const err = new Error('The user aborted a request')
    err.name = 'AbortError'
    expect(normalizeLLMError(err).code).toBe('abort')
  })

  it('普通 Error -> unknown（不可重试）', () => {
    const err = new Error('something broke')
    const n = normalizeLLMError(err)
    expect(n.code).toBe('unknown')
    expect(n.retryable).toBe(false)
  })

  it('非 Error 值 -> unknown', () => {
    expect(normalizeLLMError('string').code).toBe('unknown')
    expect(normalizeLLMError(null).code).toBe('unknown')
    expect(normalizeLLMError(undefined).code).toBe('unknown')
  })

  it('已归一化的 LLMError 原样返回（不二次包装）', () => {
    const err = new RateLimitError(429, undefined, 'rl', undefined)
    const once = normalizeLLMError(err)
    const twice = normalizeLLMError(once)
    expect(twice).toBe(once)
  })

  it('isLLMError 识别', () => {
    expect(isLLMError(normalizeLLMError(new Error('x')))).toBe(true)
    expect(isLLMError(new Error('x'))).toBe(false)
    expect(isLLMError(null)).toBe(false)
    expect(isLLMError('x')).toBe(false)
  })
})
