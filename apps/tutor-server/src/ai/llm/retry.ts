// ── LLM 请求重试中间件 ──
//
// 仅对 normalizeLLMError 判定为 retryable 的错误（限流 / 5xx / 网络 / 超时）做指数退避重试。
// 不可重试错误（abort / auth / bad-request / unknown）与 signal abort 立即抛出。
//
// 设计参考 xsai 的 retry 中间件：maxRetries + 指数退避 + jitter。

import { isLLMError, normalizeLLMError, type LLMError } from './errors.js'

export interface RetryOptions {
  /** 最大重试次数（不含首次请求），默认 2 */
  maxRetries?: number
  /** 外部 abort 信号；一旦 abort 立即停止重试并抛出 abort 错误 */
  signal?: AbortSignal
  /** 每次重试前的回调（用于日志） */
  onRetry?: (err: LLMError, attempt: number, delay: number) => void
  /** 退避基准延迟（毫秒），默认 500 */
  baseDelay?: number
}

/**
 * 指数退避 + jitter：delay = baseDelay * 2^(attempt-1) + jitter(0..baseDelay)
 *
 * attempt 从 1 开始（第一次重试）。
 */
function backoffDelay(attempt: number, baseDelay: number): number {
  const exp = baseDelay * Math.pow(2, attempt - 1)
  const jitter = Math.floor(Math.random() * baseDelay)
  return exp + jitter
}

/**
 * 对可重试的 LLM 错误进行指数退避重试。
 *
 * - 非重试错误：立即抛出归一化后的 LLMError
 * - signal abort：立即抛出 code='abort' 的 LLMError
 * - 重试耗尽：抛出最后一次的归一化 LLMError
 *
 * 返回值已是归一化后的 LLMError（若抛错）。
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2
  const baseDelay = options?.baseDelay ?? 500
  const signal = options?.signal

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 前置：等待期间已被 abort，立即抛
    if (signal?.aborted) {
      throw normalizeLLMError(new Error('AbortError'))
    }

    try {
      return await fn()
    } catch (err) {
      lastError = err
      const normalized = isLLMError(err) ? err : normalizeLLMError(err)

      // 不可重试错误，立即抛
      if (!normalized.retryable) {
        throw normalized
      }
      // 已是最后一次尝试，抛出
      if (attempt >= maxRetries) {
        throw normalized
      }

      const delay = backoffDelay(attempt + 1, baseDelay)
      options?.onRetry?.(normalized, attempt + 1, delay)

      // 等待期间若 abort，sleep 会 reject abort 错误，被下一次循环顶部的检查捕获
      await sleep(delay, signal)
    }
  }

  // 理论不可达（循环必在内部 return 或 throw）
  throw normalizeLLMError(lastError)
}

/**
 * 可被 AbortSignal 打断的 sleep。
 *
 * signal abort 时立即 reject 一个 code='abort' 的 LLMError。
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(normalizeLLMError(new Error('AbortError')))
      return
    }
    const timer = setTimeout(resolve, ms)
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(normalizeLLMError(new Error('AbortError')))
        },
        { once: true }
      )
    }
  })
}
