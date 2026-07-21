import OpenAI from 'openai'
import { logger } from '../../logger.js'
import type { LLMMessage, LLMStreamChunk } from '../llm.js'
import { OpenAIBaseProvider, type OpenAIBaseProviderOptions } from './openai-base.js'

/**
 * 小米 MiMo Provider 构造选项。
 */
export interface XiaomiProviderOptions extends Omit<
  OpenAIBaseProviderOptions,
  'name' | 'capabilities'
> {}

/**
 * 小米 MiMo LLM Provider（OpenAI 兼容）。
 *
 * 继承 OpenAI 基类，仅保留小米专属差异：
 * - 根据模型名动态判断音频输入能力
 * - 音频内容使用小米 `input_audio` 格式
 * - 过滤 `reasoning_content`（内部思考）
 */
export class XiaomiProvider extends OpenAIBaseProvider {
  private reasoningTokens = 0

  constructor(options: XiaomiProviderOptions) {
    const model = options.model.toLowerCase()
    const isVoiceModel =
      model.includes('voice') ||
      model.includes('audio') ||
      model.includes('omni') ||
      model.includes('speech') ||
      model === 'mimo-v2.5'

    super({
      ...options,
      name: 'xiaomi',
      capabilities: {
        supportsAudioInput: isVoiceModel,
        supportsStreaming: true
      }
    })

    logger.info(
      {
        model: options.model,
        audioInput: this.capabilities.supportsAudioInput
      },
      '小米提供商初始化完成'
    )
  }

  async *stream(
    messages: LLMMessage[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<LLMStreamChunk> {
    // 每轮流式请求前重置 reasoning 计数
    this.reasoningTokens = 0
    yield* super.stream(messages, options)
  }

  /**
   * 为小米 API 归一化消息。
   *
   * - 字符串内容原样通过。
   * - 多模态内容：保留文本部分，音频部分转换为
   *   小米的 `input_audio` 格式（data URL）。
   */
  protected normalizeMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(msg =>
      this.normalizeForXiaomi(msg)
    ) as unknown as OpenAI.Chat.ChatCompletionMessageParam[]
  }

  /**
   * 从非流式响应中提取回复文本，并过滤 reasoning_content。
   */
  protected extractContent(response: OpenAI.Chat.Completions.ChatCompletion): string {
    const message = response.choices[0]?.message
    // MiMo 可能同时返回 content（回复）和 reasoning_content（内部思考）。
    // 助手回复必须只使用 content；reasoning_content 不是面向用户的，
    // 否则会泄露模型的内心独白到聊天中。
    const raw = message as unknown as Record<string, unknown> | undefined
    const content = message?.content ?? ''
    if (!content && raw?.reasoning_content) {
      logger.warn(
        { reasoningPreview: String(raw.reasoning_content).slice(0, 80) },
        '小米返回 content 为空但存在 reasoning_content，已忽略思考内容'
      )
    }
    return content
  }

  /**
   * 从流式 chunk 中提取回复文本，并过滤 reasoning_content。
   */
  protected handleStreamChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): string | null {
    // MiMo 流式：delta.content 是回复；delta.reasoning_content 是
    // 内部思考，绝不能发送给用户。
    const delta = chunk.choices[0]?.delta as
      (Record<string, unknown> & { content?: string }) | undefined
    const content = (delta?.content as string | undefined) ?? ''
    const reasoning = (delta?.reasoning_content as string | undefined) ?? ''
    if (reasoning) {
      // 静默统计 reasoning，绝不产出。在每次流式完成时于日志中露面，
      // 以便排查「思考内容泄露到 UI」问题时确认字段级过滤生效。
      this.reasoningTokens += reasoning.length
    }
    return content || null
  }

  /**
   * 流式完成日志，追加 reasoningTokens 统计。
   */
  protected logStreamComplete(duration: number, totalTokens: number): void {
    super.logStreamComplete(duration, totalTokens, {
      reasoningTokens: this.reasoningTokens
    })
  }

  private normalizeForXiaomi(msg: LLMMessage): Record<string, unknown> {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    const parts: unknown[] = []
    for (const part of msg.content) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text })
      } else if (part.type === 'audio') {
        const audio = part
        parts.push({
          type: 'input_audio',
          input_audio: {
            data: `data:audio/${audio.format};base64,${audio.data}`
          }
        })
      }
    }

    return { role: msg.role, content: parts }
  }
}
