import { logger } from '../../logger.js'
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMStreamChunk,
  ProviderCapabilities
} from './types.js'
import { extractTextContent } from './utils.js'

export class MockProvider implements LLMProvider {
  readonly name = 'mock'
  readonly capabilities: ProviderCapabilities = {
    supportsAudioInput: false,
    supportsStreaming: true
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
        text: "Hello! I'm your English conversation partner. Let's practice speaking together!",
        motionId: 'wave',
        expressionId: 'happy',
        vocabulary: ['practice', 'speaking', 'together']
      })
    }
  }

  async *stream(
    messages: LLMMessage[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<LLMStreamChunk> {
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
      text: "Hello! I'm your English conversation partner. Let's practice speaking together!",
      textZh: '你好！我是你的英语对话伙伴。让我们一起练习口语吧！',
      motionId: 'wave',
      expressionId: 'happy',
      vocabulary: ['practice', 'speaking', 'together']
    })

    await new Promise(resolve => setTimeout(resolve, 300))
    if (signal?.aborted) {
      throw new Error('AbortError')
    }
    yield { content: response, isEnd: true }
  }
}
