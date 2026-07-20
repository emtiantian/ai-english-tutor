// ── LLM 错误归一化 ──
//
// 把各 Provider（目前主要是 OpenAI SDK 抛出的错误，未来包括 Claude / Gemini adapter）
// 归一化为统一的 LLMError，供上层 engine / 路由层做一致的处理与用户提示。
//
// 设计参考 xsai：错误带 `code` + `retryable`，重试中间件只对 `retryable: true` 的错误重试。

import {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from 'openai'

/**
 * 归一化后的 LLM 错误码。
 *
 * - `abort`：用户主动取消（AbortSignal），不可重试
 * - `auth`：401/403 鉴权失败，不可重试
 * - `rate-limit`：429 限流，可重试
 * - `bad-request`：400/404/409/422 请求参数错，不可重试
 * - `timeout`：连接超时，可重试
 * - `network`：网络连接错误，可重试
 * - `server`：5xx 服务端错误，可重试
 * - `unknown`：其他未识别错误，不可重试
 */
export type LLMErrorCode =
  | 'abort'
  | 'auth'
  | 'rate-limit'
  | 'bad-request'
  | 'timeout'
  | 'network'
  | 'server'
  | 'unknown'

/**
 * 统一 LLM 错误类型。
 *
 * 所有 Provider 抛出的错误最终都被 {@link normalizeLLMError} 归一化为此类型，
 * 重试中间件与上层处理逻辑统一依赖 `code` / `retryable` 字段。
 */
export interface LLMError extends Error {
  code: LLMErrorCode
  retryable: boolean
  /** HTTP 状态码（若错误源自 HTTP 响应） */
  status?: number
  /** 原始错误对象 */
  cause?: unknown
}

/**
 * 判断错误是否为归一化后的 LLMError。
 *
 * 归一化后的错误 `name` 统一为 `'LLMError'`。
 */
export function isLLMError(e: unknown): e is LLMError {
  return e instanceof Error && e.name === 'LLMError'
}

/**
 * 把任意错误归一化为 {@link LLMError}。
 *
 * 已归一化的错误原样返回（避免二次包装）。
 */
export function normalizeLLMError(e: unknown): LLMError {
  // 已归一化，直接返回
  if (isLLMError(e)) return e

  // 用户主动取消：SDK 抛 APIUserAbortError；或 Provider 内部手动 throw 的 'AbortError'
  if (
    e instanceof APIUserAbortError ||
    (e instanceof Error && (e.name === 'AbortError' || e.message === 'AbortError'))
  ) {
    return createLLMError('abort', 'AbortError', false, e)
  }

  if (e instanceof APIConnectionTimeoutError) {
    return createLLMError('timeout', 'LLM 请求超时', true, e)
  }

  if (e instanceof APIConnectionError) {
    return createLLMError('network', 'LLM 网络连接失败', true, e)
  }

  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) {
    return createLLMError('auth', 'LLM 鉴权失败：API Key 无效或无权限', false, e, e.status)
  }

  if (e instanceof RateLimitError) {
    return createLLMError('rate-limit', 'LLM 触发限流', true, e, e.status)
  }

  if (
    e instanceof BadRequestError ||
    e instanceof NotFoundError ||
    e instanceof ConflictError ||
    e instanceof UnprocessableEntityError
  ) {
    return createLLMError('bad-request', 'LLM 请求参数错误', false, e, e.status)
  }

  if (e instanceof InternalServerError) {
    return createLLMError('server', 'LLM 服务端错误', true, e, e.status)
  }

  // 兜底：带 status 的 APIError 按 HTTP 区间归类（覆盖 SDK 未细分的子类）
  if (e instanceof APIError) {
    const status = e.status
    if (typeof status === 'number') {
      if (status >= 500) return createLLMError('server', 'LLM 服务端错误', true, e, status)
      if (status === 429) return createLLMError('rate-limit', 'LLM 触发限流', true, e, status)
      if (status === 401 || status === 403) return createLLMError('auth', 'LLM 鉴权失败', false, e, status)
      if (status >= 400) return createLLMError('bad-request', 'LLM 请求参数错误', false, e, status)
    }
    return createLLMError('unknown', 'LLM 未知错误', false, e, status)
  }

  // 普通 Error / 非 Error
  if (e instanceof Error) {
    return createLLMError('unknown', e.message || 'LLM 未知错误', false, e)
  }
  return createLLMError('unknown', 'LLM 未知错误', false, e)
}

/**
 * 构造 LLMError 实例。
 *
 * 注意：`abort` 错误的 `message` 保持 `'AbortError'` 字符串，兼容历史日志与潜在的上层字符串识别。
 */
function createLLMError(
  code: LLMErrorCode,
  message: string,
  retryable: boolean,
  cause: unknown,
  status?: number,
): LLMError {
  const err = new Error(message) as LLMError
  err.name = 'LLMError'
  err.code = code
  err.retryable = retryable
  err.status = status
  err.cause = cause
  return err
}
