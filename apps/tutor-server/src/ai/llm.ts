import { config } from '../config.js'
import { logger } from '../logger.js'
import { DeepSeekProvider } from './providers/deepseek.js'
import { XiaomiProvider } from './providers/xiaomi.js'

// ── Content Types ──

export interface TextContent {
  type: 'text'
  text: string
}

export interface AudioContent {
  type: 'audio'
  /** Base64 encoded audio data */
  data: string
  /** Audio format: mp3, wav, webm, etc. */
  format: string
}

export type MessageContent = TextContent | AudioContent

// ── Message Format ──

/**
 * LLM Message format
 *
 * Supports multimodal content (text + audio).
 * For providers that don't support audio, content is normalized to string.
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | MessageContent[]
}

// ── Response ──

export interface LLMResponse {
  /** Text content */
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

// ── Provider Capabilities ──

export interface ProviderCapabilities {
  /** Whether the provider supports audio input (user voice) */
  supportsAudioInput: boolean
  /** Whether the provider supports streaming */
  supportsStreaming: boolean
}

// ── Provider Interface ──

export interface LLMProvider {
  readonly name: string

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities

  /** Non-streaming completion */
  complete(messages: LLMMessage[], signal?: AbortSignal): Promise<LLMResponse>

  /** Streaming completion (text only) */
  stream?(messages: LLMMessage[], options?: { signal?: AbortSignal }): AsyncGenerator<LLMStreamChunk>
}

// ── Mock Provider ──

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
    logger.debug({ mock: true, prompt: text?.slice(0, 50) }, 'Mock LLM complete')

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
    logger.debug({ mock: true, prompt: text?.slice(0, 50) }, 'Mock LLM stream')

    // Yield the full JSON response in one chunk so downstream parsing can extract
    // text, textZh, vocabulary, etc. just like the non-streaming path.
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

// ── Factory ──

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
      logger.warn({ provider }, 'Unknown LLM provider, falling back to mock')
      return new MockProvider()
  }
}

// ── Helpers ──

/**
 * Extract text content from a message (handles both string and multimodal content)
 */
export function extractTextContent(message: LLMMessage | undefined): string {
  if (!message) return ''

  if (typeof message.content === 'string') {
    return message.content
  }

  // Multimodal content: extract text parts
  return message.content
    .filter((c): c is TextContent => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
}

/**
 * Normalize message content to string for providers that don't support multimodal
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


