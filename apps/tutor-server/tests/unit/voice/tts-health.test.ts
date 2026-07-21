import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

/**
 * CosyVoice 健康探测单元测试
 *
 * 测试策略：mock 全局 `fetch`，不发真实网络请求。
 * - 422 -> ok=true（fastapi 路由已注册，存活）
 * - 200 -> ok=true（服务能正常合成，存活）
 * - fetch 抛连接错误 -> ok=false 且 error 有值
 * - fetch 抛 AbortError -> ok=false 且 error 提示超时
 * - 超时参数生效（用 fake timers 验证指定 ms 后 signal 被 abort）
 */
describe('checkCosyVoiceHealth', () => {
  const env = createTestEnv('tts-health')
  let originalFetch: typeof globalThis.fetch

  beforeAll(() => {
    env.setup()
    originalFetch = globalThis.fetch
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
    env.cleanup()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('treats 422 as service alive (ok=true)', async () => {
    // 模拟 fastapi 对缺失 tts_text 字段的 422 响应
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 422, statusText: 'Unprocessable Entity' })
    )
    const { checkCosyVoiceHealth } = await import('@/voice/tts-health.js')
    const result = await checkCosyVoiceHealth('http://localhost:50000', '英文女')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(422)
    expect(result.error).toBeUndefined()
  })

  it('treats 200 as service alive (ok=true)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200, statusText: 'OK' })
    )
    const { checkCosyVoiceHealth } = await import('@/voice/tts-health.js')
    const result = await checkCosyVoiceHealth('http://localhost:50000', '英文女')
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.error).toBeUndefined()
  })

  it('returns ok=false with error on connection failure', async () => {
    // 模拟连接拒绝（Node fetch 在网络层失败时抛 TypeError('fetch failed')）
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const { checkCosyVoiceHealth } = await import('@/voice/tts-health.js')
    const result = await checkCosyVoiceHealth('http://localhost:50000', '英文女')
    expect(result.ok).toBe(false)
    expect(result.status).toBeUndefined()
    expect(result.error).toBeTruthy()
    expect(result.error).toContain('fetch failed')
  })

  it('returns ok=false with timeout hint on AbortError', async () => {
    // 模拟 AbortController 触发后的 AbortError（DOMException）
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)
    const { checkCosyVoiceHealth } = await import('@/voice/tts-health.js')
    const result = await checkCosyVoiceHealth('http://localhost:50000', '英文女', 15_000)
    expect(result.ok).toBe(false)
    expect(result.status).toBeUndefined()
    expect(result.error).toContain('超时')
    expect(result.error).toContain('15000')
  })

  it('aborts the request after the specified timeout (signal.aborted)', async () => {
    // 用 fake timers 验证：到达 timeoutMs 后 AbortController 会被触发，
    // fetch 收到的 signal 会变成 aborted 状态。
    vi.useFakeTimers()

    let capturedSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      capturedSignal = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        // 永不自然 resolve，只能被 abort 触发 reject
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'))
          })
        }
      })
    })

    const { checkCosyVoiceHealth } = await import('@/voice/tts-health.js')
    const promise = checkCosyVoiceHealth('http://localhost:50000', '英文女', 5_000)

    // 超时前 signal 不应被 abort
    expect(capturedSignal?.aborted).toBe(false)

    // 推进 5 秒，触发 setTimeout -> controller.abort()
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await promise

    expect(capturedSignal?.aborted).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('超时')

    vi.useRealTimers()
  })

  it('strips trailing slash from baseUrl when building probe url', async () => {
    // 验证 baseUrl 末尾斜杠被正确处理
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 422 }))

    const { checkCosyVoiceHealth } = await import('@/voice/tts-health.js')
    await checkCosyVoiceHealth('http://localhost:50000/', '英文女')

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0])
    expect(calledUrl).toBe('http://localhost:50000/inference_sft')
    expect(calledUrl).not.toContain('//inference')
  })
})
