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
