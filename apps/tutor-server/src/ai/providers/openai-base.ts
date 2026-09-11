import OpenAI from 'openai'
import { logger } from '../../logger.js'
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ProviderCapabilities
} from '../llm.js'
import { normalizeToString } from '../llm.js'
import { normalizeLLMError } from '../llm/errors.js'
import { withRetry } from '../llm/retry.js'

/**
 * OpenAI 兼容 LLM Provider 的通用构造选项。
 *
 * 所有基于 OpenAI SDK 的 Provider（DeepSeek、火山方舟、小米）
 * 都通过该选项初始化，子类只需补充 name、capabilities 与默认值。
 */
export interface OpenAIBaseProviderOptions {
  /** Provider 标识名 */
  name: string
  /** OpenAI 兼容服务的 API Key */
  apiKey: string
  /** OpenAI 兼容 Base URL */
  baseURL: string
  /** 模型名或接入点 ID */
  model: string
  /** Provider 能力声明 */
  capabilities: ProviderCapabilities
  /** 采样温度，默认 0.7 */
  temperature?: number
  /** 最大 token 数，默认 512 */
  maxTokens?: number
  /**
   * 自定义 fetch 实现。
   *
   * 默认使用 Node 原生 fetch(undici)，绕开 OpenAI SDK 内置的 node-fetch@2
   * （其在 Linux 容器解压 gzip 响应时会抛 ERR_STREAM_PREMATURE_CLOSE）。
   */
  fetch?: typeof globalThis.fetch
  /** 最大重试次数（不含首次），默认 2；仅对可重试错误（限流/5xx/网络/超时）生效 */
  maxRetries?: number
  /** 请求超时（毫秒），默认 30000；仅作用于非流式 complete */
  timeout?: number
}

/**
 * OpenAI 兼容 LLM Provider 基类。
 *
 * 封装 OpenAI SDK 的通用调用逻辑，子类通过覆盖 protected hook
 * （normalizeMessages / extractContent / handleStreamChunk 等）实现差异。
 */
export abstract class OpenAIBaseProvider implements LLMProvider {
  protected readonly client: OpenAI
  readonly name: string
  readonly capabilities: ProviderCapabilities
  protected readonly model: string
  protected readonly temperature: number
  protected readonly maxTokens: number
  protected readonly maxRetries: number
  protected readonly timeout: number

  constructor(options: OpenAIBaseProviderOptions) {
    if (!options.apiKey) {
      throw new Error(`未配置 ${options.name} API Key`)
    }
    if (!options.model) {
      throw new Error(`未配置 ${options.name} 模型`)
    }

    this.name = options.name
    this.capabilities = options.capabilities
    this.model = options.model
    this.temperature = options.temperature ?? 0.7
    this.maxTokens = options.maxTokens ?? 512
    this.maxRetries = options.maxRetries ?? 2
    this.timeout = options.timeout ?? 30_000
    // maxRetries: 0 禁用 SDK 内置重试，由 withRetry 中间件统一接管（避免双重重试）。
    // timeout 仅对非流式请求生效；流式依赖外部 AbortSignal 控制生命周期。
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      fetch: options.fetch ?? globalThis.fetch,
      maxRetries: 0,
      timeout: this.timeout
    })
  }

  async complete(messages: LLMMessage[], signal?: AbortSignal): Promise<LLMResponse> {
    const normalizedMessages = this.normalizeMessages(messages)

    logger.debug({ provider: this.name, messageCount: normalizedMessages.length }, 'LLM 完整请求')

    const startTime = Date.now()
    const response = await withRetry(
      () =>
        this.client.chat.completions.create(this.buildRequestOptions(normalizedMessages, false), {
          signal
        }) as Promise<OpenAI.Chat.Completions.ChatCompletion>,
      {
        maxRetries: this.maxRetries,
        signal,
        onRetry: (err, attempt, delay) => {
          logger.warn(
            { provider: this.name, attempt, delay, code: err.code, status: err.status },
            'LLM 请求重试'
          )
        }
      }
    )
    const duration = Date.now() - startTime

    const content = this.extractContent(response)
    const usage = response.usage

    logger.info({ provider: this.name, duration, tokens: usage?.total_tokens }, 'LLM 完整响应')

    return {
      content,
      usage: this.parseUsage(usage)
    }
  }

  async *stream(
    messages: LLMMessage[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<LLMStreamChunk> {
    const signal = options?.signal
    const normalizedMessages = this.normalizeMessages(messages)

    logger.debug({ provider: this.name, messageCount: normalizedMessages.length }, 'LLM 流式请求')

    const startTime = Date.now()

    // 流式请求不重试：重试会重复输出已 yield 的内容，导致前端气泡重复。
    // 仅做错误归一化，把 SDK/网络错误统一成 LLMError 供上层处理。
    try {
      if (signal?.aborted) {
        throw new Error('AbortError')
      }

      const stream = await this.createStream(normalizedMessages, signal)

      let totalTokens = 0

      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new Error('AbortError')
        }
        const content = this.handleStreamChunk(chunk)
        if (content) {
          totalTokens += content.length
          yield {
            content,
            isEnd: false
          }
        }
      }

      const duration = Date.now() - startTime
      this.logStreamComplete(duration, totalTokens)
    } catch (err) {
      throw normalizeLLMError(err)
    }

    yield {
      content: '',
      isEnd: true
    }
  }

  /**
   * 构建 OpenAI chat.completions.create 请求参数。
   */
  protected buildRequestOptions(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    stream: boolean
  ): OpenAI.Chat.ChatCompletionCreateParams {
    return {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream
    } as OpenAI.Chat.ChatCompletionCreateParams
  }

  /**
   * 发起流式请求，返回 OpenAI 流式迭代器。
   */
  protected async createStream(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    signal?: AbortSignal
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    return this.client.chat.completions.create(
      this.buildRequestOptions(messages, true) as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal }
    )
  }

  /**
   * 归一化消息。
   *
   * 默认实现丢弃多模态音频，只保留文本。
   * 子类可覆盖以支持音频输入（如小米）。
   */
  protected normalizeMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(normalizeToString) as OpenAI.Chat.ChatCompletionMessageParam[]
  }

  /**
   * 解析 token 使用量。
   */
  protected parseUsage(usage: OpenAI.CompletionUsage | undefined): LLMResponse['usage'] {
    if (!usage) return undefined
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens
    }
  }

  /**
   * 从非流式响应中提取回复文本。
   */
  protected extractContent(response: OpenAI.Chat.Completions.ChatCompletion): string {
    return response.choices[0]?.message?.content ?? ''
  }

  /**
   * 从流式 chunk 中提取回复文本。
   *
   * 返回 null 表示该 chunk 没有有效内容，不需要 yield。
   */
  protected handleStreamChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): string | null {
    return chunk.choices[0]?.delta?.content ?? null
  }

  /**
   * 流式完成后的日志钩子。
   */
  protected logStreamComplete(
    duration: number,
    totalTokens: number,
    extra?: Record<string, unknown>
  ): void {
    logger.info({ provider: this.name, duration, totalTokens, ...extra }, 'LLM 流式完成')
  }
}
