import OpenAI from 'openai'
import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ProviderCapabilities,
  AudioContent,
} from '../llm.js'
import { normalizeToString } from '../llm.js'

/**
 * Xiaomi MiMo LLM Provider (OpenAI-compatible)
 *
 * Supports text and audio-understanding models.
 * Audio input uses the `input_audio` content type per Xiaomi's API spec.
 *
 * Configuration:
 *   XIAOMI_API_KEY  - API key
 *   XIAOMI_BASE_URL - API base URL (default: https://api.xiaomimimo.com/v1)
 *   XIAOMI_MODEL    - Model name (default: milm-pro)
 *
 * Voice-capable models:
 *   mimo-v2.5       — audio understanding (accepts input_audio, returns text)
 *   mimo-v2-omni    — omni-modal (same)
 */
export class XiaomiProvider implements LLMProvider {
  private client: OpenAI
  readonly name = 'xiaomi'
  readonly capabilities: ProviderCapabilities

  constructor() {
    if (!config.XIAOMI_API_KEY) {
      throw new Error('XIAOMI_API_KEY is not configured')
    }

    this.client = new OpenAI({
      apiKey: config.XIAOMI_API_KEY,
      baseURL: config.XIAOMI_BASE_URL,
      // 强制用 Node 原生 fetch(undici)，绕开 OpenAI SDK 内置的 node-fetch@2。
      // node-fetch@2 解压 gzip 响应时会在连接收尾抛 ERR_STREAM_PREMATURE_CLOSE，
      // 在 Linux 容器里稳定复现 → LLM 调用全失败、对话走兜底、TTS 出不来声。
      fetch: globalThis.fetch,
    })

    const model = config.XIAOMI_MODEL.toLowerCase()
    const isVoiceModel =
      model.includes('voice') ||
      model.includes('audio') ||
      model.includes('omni') ||
      model.includes('speech') ||
      model === 'mimo-v2.5'

    this.capabilities = {
      supportsAudioInput: isVoiceModel,
      supportsStreaming: true,
    }

    logger.info(
      {
        model: config.XIAOMI_MODEL,
        audioInput: this.capabilities.supportsAudioInput,
      },
      'Xiaomi provider initialized',
    )
  }

  async complete(messages: LLMMessage[], signal?: AbortSignal): Promise<LLMResponse> {
    const normalizedMessages = messages.map((msg) => this.normalizeForXiaomi(msg))

    logger.debug(
      { provider: this.name, messageCount: normalizedMessages.length },
      'LLM complete request',
    )

    const startTime = Date.now()
    const response = await this.client.chat.completions.create(
      {
        model: config.XIAOMI_MODEL,
        messages: normalizedMessages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: 0.7,
        max_tokens: 512,
      },
      { signal },
    )
    const duration = Date.now() - startTime

    const message = response.choices[0]?.message
    // MiMo may return both content (reply) and reasoning_content (internal thinking).
    // We must only use content for the assistant reply; reasoning_content is NOT
    // user-facing and would leak the model's internal monologue into the chat.
    const raw = message as unknown as Record<string, unknown> | undefined
    const content = message?.content ?? ''
    if (!content && raw?.reasoning_content) {
      logger.warn(
        { reasoningPreview: String(raw.reasoning_content).slice(0, 80) },
        'Xiaomi response content is empty but reasoning_content present; ignoring reasoning',
      )
    }
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

    const normalizedMessages = messages.map((msg) => this.normalizeForXiaomi(msg))

    logger.debug(
      { provider: this.name, messageCount: normalizedMessages.length },
      'LLM stream request',
    )

    const startTime = Date.now()
    const stream = await this.client.chat.completions.create({
      model: config.XIAOMI_MODEL,
      messages: normalizedMessages as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: 0.7,
      max_tokens: 512,
      stream: true,
    })

    let totalTokens = 0
    let reasoningTokens = 0

    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new Error('AbortError')
      }
      // MiMo streaming: delta.content is the reply; delta.reasoning_content is
      // internal thinking and must NOT be sent to the user.
      const delta = chunk.choices[0]?.delta as
        | (Record<string, unknown> & { content?: string })
        | undefined
      const content = (delta?.content as string | undefined) ?? ''
      const reasoning = (delta?.reasoning_content as string | undefined) ?? ''
      if (reasoning) {
        // Track reasoning silently — never yield it. Surface in logs once per
        // stream completion so we can confirm the field-level filter is working
        // when investigating "thinking leaked to UI" reports.
        reasoningTokens += reasoning.length
      }
      if (content) {
        totalTokens += content.length
        yield { content, isEnd: false }
      }
    }

    const duration = Date.now() - startTime
    logger.info(
      { provider: this.name, duration, totalTokens, reasoningTokens },
      'LLM stream complete',
    )

    yield { content: '', isEnd: true }
  }

  /**
   * Normalize a message for Xiaomi's API.
   *
   * - String content passes through as-is.
   * - Multimodal content: text parts kept, audio parts converted to
   *   Xiaomi's `input_audio` format (data URL).
   */
  private normalizeForXiaomi(msg: LLMMessage): Record<string, unknown> {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    const parts: unknown[] = []
    for (const part of msg.content) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text })
      } else if (part.type === 'audio') {
        const audio = part as AudioContent
        parts.push({
          type: 'input_audio',
          input_audio: {
            data: `data:${audio.format};base64,${audio.data}`,
          },
        })
      }
    }

    return { role: msg.role, content: parts }
  }
}
