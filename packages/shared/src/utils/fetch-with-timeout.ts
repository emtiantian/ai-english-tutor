/**
 * 带超时的 fetch。
 *
 * 若请求在指定毫秒数内未完成，则抛出超时错误。
 * 可在浏览器和 Node 环境中使用。
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 30000, ...rest } = init
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(input, { ...rest, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}
