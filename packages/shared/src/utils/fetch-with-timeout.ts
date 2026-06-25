/**
 * Fetch with a timeout.
 *
 * Rejects with a timeout error if the request does not complete within the
 * specified number of milliseconds. Available in both browser and Node
 * environments.
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
