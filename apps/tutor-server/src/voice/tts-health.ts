/**
 * CosyVoice TTS 服务健康探测
 *
 * 用于后端启动时异步探测 CosyVoice fastapi 服务是否存活，
 * 失败仅日志告警、不阻塞启动（由调用方负责日志和异常处理）。
 */

/** 默认健康探测超时（毫秒）- 比合成超时短，仅用于判断服务是否存活 */
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 15_000

/** 健康探测结果 */
export interface CosyVoiceHealthResult {
  /** true=服务存活（fastapi 路由已注册、能响应 HTTP）；false=连接失败/超时 */
  ok: boolean
  /** HTTP 响应状态码（任意状态码都算存活，仅在网络层失败时为 undefined） */
  status?: number
  /** 失败时的错误描述（ok=false 时有值） */
  error?: string
}

/**
 * 给 fetch 加超时：超过 timeoutMs 后中止请求并抛 AbortError。
 * 与 cosyvoice.ts 中的 fetchWithTimeout 思路一致，独立复刻以避免改动现有模块导出。
 */
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * 探测 CosyVoice fastapi 服务是否存活。
 *
 * 策略：向 `/inference_sft` 发送一个**故意缺少 tts_text 字段**的 multipart/form-data 请求，
 * 期望返回 422 Unprocessable Entity。
 *
 * 为什么用 422 而不是 200：
 * - 200 会触发真实 TTS 合成，占用 GPU 显存与时间，对健康探测是浪费。
 * - FastAPI 对 Required 字段缺失的请求会稳定返回 422，且不会进入模型推理路径，开销极小。
 * - 只要 fastapi 进程已起、路由已注册，就能返回 422，足以证明服务存活。
 * - 真正合成请求的失败（如模型未加载）通常返回 500，仍判定 ok=true，
 *   因为这种情况重启后端无济于事，应通过日志告警人工介入。
 *
 * 判定规则：
 * - 收到任意 HTTP 响应（任意状态码） -> ok=true，status=响应状态码
 * - 连接拒绝 / DNS 失败 / 超时 / AbortError -> ok=false，error 带上原因
 *
 * @param baseUrl   CosyVoice 服务基础地址，如 `http://localhost:50000`
 * @param spkId     发音人 ID（探测时仅作为 form 字段填充，不会被真正用于合成）
 * @param timeoutMs 超时毫秒数，默认 15s
 */
export async function checkCosyVoiceHealth(
  baseUrl: string,
  spkId: string,
  timeoutMs: number = DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
): Promise<CosyVoiceHealthResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/inference_sft`

  // 故意只发 spk_id，不发 tts_text，期望 422。
  // 注意：即便某些 fastapi/multipart 中间件在完全空 form 时返回 400，
  // 400 同样能证明服务存活，判定逻辑不变（任意 HTTP 响应即 ok=true）。
  const form = new FormData()
  form.append('spk_id', spkId)

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        body: form,
      },
      timeoutMs,
    )
    return { ok: true, status: response.status }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const error = isAbort
      ? `健康探测超时（${timeoutMs}ms 内无响应）`
      : err instanceof Error
        ? err.message
        : String(err)
    return { ok: false, error }
  }
}
