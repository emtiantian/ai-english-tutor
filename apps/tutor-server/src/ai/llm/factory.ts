import { config } from '../../config.js'
import { DeepSeekProvider } from '../providers/deepseek.js'
import { MockProvider } from './mock-provider.js'
import type { LLMProvider } from './types.js'

export function createLLMProvider(): LLMProvider {
  const provider = config.LLM_PROVIDER

  switch (provider) {
    case 'deepseek':
      return new DeepSeekProvider({
        apiKey: config.DEEPSEEK_API_KEY,
        baseURL: config.DEEPSEEK_BASE_URL,
        model: config.DEEPSEEK_MODEL
      })
    case 'mock':
      return new MockProvider()
    default:
      throw new Error(`不支持的 LLM 提供商: ${provider}。当前仅支持 deepseek 和测试用 mock。`)
  }
}
