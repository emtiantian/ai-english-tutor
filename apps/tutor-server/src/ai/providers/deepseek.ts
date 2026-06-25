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
 * DeepSeek LLM Provider
 *
 * DeepSeek API is compatible with OpenAI API format.
 * Base URL: https://api.deepseek.com
 * Model: deepseek-chat (DeepSeek-V3)
 *        deepseek-reasoner (DeepSeek-R1)
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
      throw new Error('DEEPSEEK_API_KEY is not configured')
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
      'LLM complete request',
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
      'LLM complete response',
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
      'LLM stream request',
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
      'LLM stream complete',
    )

    yield {
      content: '',
      isEnd: true,
    }
  }
}
