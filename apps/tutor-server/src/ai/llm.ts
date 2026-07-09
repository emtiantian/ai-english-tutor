import { config } from '../config.js'
import { logger } from '../logger.js'
import { DeepSeekProvider } from './providers/deepseek.js'
import { XiaomiProvider } from './providers/xiaomi.js'

// ── 内容类型 ──

export interface TextContent {
  type: 'text'
  text: string
}

export interface AudioContent {
  type: 'audio'
  /** Base64 编码的音频数据 */
  data: string
  /** 音频格式：mp3、wav、webm 等 */
  format: string
}

export type MessageContent = TextContent | AudioContent

// ── 消息格式 ──

/**
 * LLM 消息格式
 *
 * 支持多模态内容（文本 + 音频）。
 * 对于不支持音频的 Provider，内容会被归一化为字符串。
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | MessageContent[]
}

// ── 响应 ──

export interface LLMResponse {
  /** 文本内容 */
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface LLMStreamChunk {
  content: string
  isEnd: boolean
}

// ── Provider 能力 ──

export interface ProviderCapabilities {
  /** Provider 是否支持音频输入（用户语音） */
  supportsAudioInput: boolean
  /** Provider 是否支持流式输出 */
  supportsStreaming: boolean
}

// ── Provider 接口 ──

export interface LLMProvider {
  readonly name: string

  /** Provider 能力 */
  readonly capabilities: ProviderCapabilities

  /** 非流式补全 */
  complete(messages: LLMMessage[], signal?: AbortSignal): Promise<LLMResponse>

  /** 流式补全（仅文本） */
  stream?(messages: LLMMessage[], options?: { signal?: AbortSignal }): AsyncGenerator<LLMStreamChunk>
}

// ── Mock Provider（模拟 Provider）──

class MockProvider implements LLMProvider {
  readonly name = 'mock'
  readonly capabilities: ProviderCapabilities = {
    supportsAudioInput: false,
    supportsStreaming: true,
  }

  async complete(messages: LLMMessage[], signal?: AbortSignal): Promise<LLMResponse> {
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    const lastMessage = messages[messages.length - 1]
    const text = extractTextContent(lastMessage)
    logger.debug({ mock: true, prompt: text?.slice(0, 50) }, 'Mock LLM 完整响应')

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 500)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('AbortError'))
      }
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })

    return {
      content: JSON.stringify({
        text: "Hello! I'm your AI English teacher. Let's practice speaking together!",
        motionId: 'wave',
        expressionId: 'happy',
        vocabulary: ['practice', 'speaking', 'together'],
      }),
    }
  }

  async *stream(messages: LLMMessage[], options?: { signal?: AbortSignal }): AsyncGenerator<LLMStreamChunk> {
    const signal = options?.signal
    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    const lastMessage = messages[messages.length - 1]
    const text = extractTextContent(lastMessage)
    logger.debug({ mock: true, prompt: text?.slice(0, 50) }, 'Mock LLM 流式响应')

    // 在一个分片里产出完整 JSON 响应，使下游解析能够像非流式路径一样
    // 提取 text、textZh、vocabulary 等字段。
    const response = JSON.stringify({
      text: "Hello! I'm your AI English teacher. Let's practice speaking together!",
      textZh: '你好！我是你的 AI 英语老师。让我们一起练习口语吧！',
      motionId: 'wave',
      expressionId: 'happy',
      vocabulary: ['practice', 'speaking', 'together'],
    })

    await new Promise((resolve) => setTimeout(resolve, 300))
    if (signal?.aborted) {
      throw new Error('AbortError')
    }
    yield { content: response, isEnd: true }
  }
}

// ── 工厂 ──

export function createLLMProvider(): LLMProvider {
  const provider = config.LLM_PROVIDER

  switch (provider) {
    case 'deepseek':
      return new DeepSeekProvider()
    case 'xiaomi':
      return new XiaomiProvider()
    case 'mock':
      return new MockProvider()
    default:
      logger.warn({ provider }, '未知 LLM 提供商，回退到 mock')
      return new MockProvider()
  }
}

// ── 辅助函数 ──

/**
 * 从消息中提取文本内容（支持字符串和多模态内容）
 */
export function extractTextContent(message: LLMMessage | undefined): string {
  if (!message) return ''

  if (typeof message.content === 'string') {
    return message.content
  }

  // 多模态内容：提取文本部分
  return message.content
    .filter((c): c is TextContent => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
}

/**
 * 将消息内容归一化为字符串，供不支持多模态的 Provider 使用
 */
export function normalizeToString(message: LLMMessage): LLMMessage {
  if (typeof message.content === 'string') {
    return message
  }

  return {
    ...message,
    content: extractTextContent(message),
  }
}


