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
 * 小米 MiMo LLM Provider（OpenAI 兼容）
 *
 * 支持文本和音频理解模型。
 * 音频输入按照小米 API 规范使用 `input_audio` 内容类型。
 *
 * 配置：
 *   XIAOMI_API_KEY  - API 密钥
 *   XIAOMI_BASE_URL - API 基础地址（默认：https://api.xiaomimimo.com/v1）
 *   XIAOMI_MODEL    - 模型名称（默认：milm-pro）
 *
 * 支持语音的模型：
 *   mimo-v2.5       — 音频理解（接受 input_audio，返回文本）
 *   mimo-v2-omni    — 全模态（同上）
 */
export class XiaomiProvider implements LLMProvider {
  private client: OpenAI
  readonly name = 'xiaomi'
  readonly capabilities: ProviderCapabilities

  constructor() {
    if (!config.XIAOMI_API_KEY) {
      throw new Error('未配置 XIAOMI_API_KEY')
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
      '小米提供商初始化完成',
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
    // MiMo 可能同时返回 content（回复）和 reasoning_content（内部思考）。
    // 助手回复必须只使用 content；reasoning_content 不是面向用户的，
    // 否则会泄露模型的内心独白到聊天中。
    const raw = message as unknown as Record<string, unknown> | undefined
    const content = message?.content ?? ''
    if (!content && raw?.reasoning_content) {
      logger.warn(
        { reasoningPreview: String(raw.reasoning_content).slice(0, 80) },
        '小米返回 content 为空但存在 reasoning_content，已忽略思考内容',
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
      // MiMo 流式：delta.content 是回复；delta.reasoning_content 是
      // 内部思考，绝不能发送给用户。
      const delta = chunk.choices[0]?.delta as
        | (Record<string, unknown> & { content?: string })
        | undefined
      const content = (delta?.content as string | undefined) ?? ''
      const reasoning = (delta?.reasoning_content as string | undefined) ?? ''
      if (reasoning) {
        // 静默统计 reasoning，绝不产出。在每次流式完成时于日志中露面，
        // 以便排查「思考内容泄露到 UI」问题时确认字段级过滤生效。
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
      'LLM 流式完成',
    )

    yield { content: '', isEnd: true }
  }

  /**
   * 为小米 API 归一化消息。
   *
   * - 字符串内容原样通过。
   * - 多模态内容：保留文本部分，音频部分转换为
   *   小米的 `input_audio` 格式（data URL）。
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
            data: `data:audio/${audio.format};base64,${audio.data}`,
          },
        })
      }
    }

    return { role: msg.role, content: parts }
  }
}
