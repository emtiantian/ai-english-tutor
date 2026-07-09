import OpenAI from 'openai'
import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ProviderCapabilities,
} from '../llm.js'
import { normalizeToString } from '../llm.js'

/**
 * DeepSeek LLM Provider 实现
 *
 * DeepSeek API 兼容 OpenAI API 格式。
 *
 * DeepSeek 官方：
 *   基础地址：https://api.deepseek.com
 *   模型：    deepseek-chat (DeepSeek-V3)
 *             deepseek-reasoner (DeepSeek-R1)
 *
 * 火山方舟（OpenAI 兼容）：
 *   基础地址：https://ark.cn-beijing.volces.com/api/v3
 *   API 密钥：火山方舟 API 密钥
 *   模型：    必须填火山方舟「推理接入点 ID」，例如 ep-xxxxxxxxxxxxx
 *             （在方舟控制台「在线推理」创建 deepseek-v4-pro 接入点后复制）
 */
export class DeepSeekProvider implements LLMProvider {
  private client: OpenAI
  readonly name = 'deepseek'
  readonly capabilities: ProviderCapabilities = {
    supportsAudioInput: false,
    supportsStreaming: true,
  }

  constructor() {
    if (!config.DEEPSEEK_API_KEY) {
      throw new Error('未配置 DEEPSEEK_API_KEY')
    }

    this.client = new OpenAI({
      apiKey: config.DEEPSEEK_API_KEY,
      baseURL: config.DEEPSEEK_BASE_URL,
      // 强制用 Node 原生 fetch(undici)，绕开 OpenAI SDK 内置的 node-fetch@2
      // (gzip 响应在 Linux 容器里会抛 ERR_STREAM_PREMATURE_CLOSE)。
      fetch: globalThis.fetch,
    })
  }

  async complete(messages: LLMMessage[], signal?: AbortSignal): Promise<LLMResponse> {
    const normalizedMessages = messages.map(normalizeToString)

    logger.debug(
      { provider: this.name, messageCount: normalizedMessages.length },
      'LLM 完整请求',
    )

    const startTime = Date.now()
    const response = await this.client.chat.completions.create(
      {
        model: config.DEEPSEEK_MODEL,
        messages: normalizedMessages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: 0.7,
        max_tokens: 512,
      },
      { signal },
    )
    const duration = Date.now() - startTime

    const content = response.choices[0]?.message?.content ?? ''
    const usage = response.usage

    logger.info(
      { provider: this.name, duration, tokens: usage?.total_tokens },
      'LLM 完整响应',
    )

    return {
      content,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    }
  }

  async *stream(messages: LLMMessage[], options?: { signal?: AbortSignal }): AsyncGenerator<LLMStreamChunk> {
    const signal = options?.signal
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    const normalizedMessages = messages.map(normalizeToString)

    logger.debug(
      { provider: this.name, messageCount: normalizedMessages.length },
      'LLM 流式请求',
    )

    const startTime = Date.now()
    const stream = await this.client.chat.completions.create({
      model: config.DEEPSEEK_MODEL,
      messages: normalizedMessages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: 0.7,
      max_tokens: 512,
      stream: true,
    })

    let totalTokens = 0

    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new Error('AbortError')
      }
      const content = chunk.choices[0]?.delta?.content ?? ''
      if (content) {
        totalTokens += content.length
        yield {
          content,
          isEnd: false,
        }
      }
    }

    const duration = Date.now() - startTime
    logger.info(
      { provider: this.name, duration, totalTokens },
      'LLM 流式完成',
    )

    yield {
      content: '',
      isEnd: true,
    }
  }
}
