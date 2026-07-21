import { describe, it, expect, vi, afterEach } from 'vitest'
import { AuthenticationError, InternalServerError } from 'openai'
import { withRetry } from '@/ai/llm/retry.js'

afterEach(() => {
  vi.restoreAllMocks()
})

const serverErr = () => new InternalServerError(500, undefined, 'srv', undefined)
const authErr = () => new AuthenticationError(401, undefined, 'auth', undefined)

describe('withRetry', () => {
  it('可重试错误重试后成功', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(serverErr())
      .mockRejectedValueOnce(serverErr())
      .mockResolvedValueOnce('ok')

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('重试耗尽后抛出归一化错误', async () => {
    const fn = vi.fn().mockRejectedValue(serverErr())
    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 1 })).rejects.toMatchObject({
      code: 'server',
      retryable: true
    })
    expect(fn).toHaveBeenCalledTimes(3) // 首次 + 2 次重试
  })

  it('不可重试错误立即抛出（fn 只调一次）', async () => {
    const fn = vi.fn().mockRejectedValue(authErr())
    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 1 })).rejects.toMatchObject({
      code: 'auth',
      retryable: false
    })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('signal 已 abort 时不调用 fn', async () => {
    const fn = vi.fn()
    const controller = new AbortController()
    controller.abort()
    await expect(withRetry(fn, { maxRetries: 3, signal: controller.signal })).rejects.toMatchObject(
      { code: 'abort' }
    )
    expect(fn).not.toHaveBeenCalled()
  })

  it('重试期间 abort 中断后续重试', async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockImplementation(() => {
      controller.abort()
      return Promise.reject(serverErr())
    })
    await expect(
      withRetry(fn, { maxRetries: 3, signal: controller.signal, baseDelay: 1 })
    ).rejects.toMatchObject({ code: 'abort' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('指数退避延迟单调递增', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // jitter=0，延迟确定
    const delays: number[] = []
    const fn = vi.fn().mockRejectedValue(serverErr())
    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelay: 10,
        onRetry: (_err, _attempt, delay) => delays.push(delay)
      })
    ).rejects.toMatchObject({ code: 'server' })
    // 2 次重试：baseDelay * 2^0 = 10, baseDelay * 2^1 = 20
    expect(delays).toEqual([10, 20])
  })
})
