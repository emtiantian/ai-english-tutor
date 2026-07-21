import { config } from '../../config.js'
import { DeepSeekProvider } from '../providers/deepseek.js'
import { OpenAIProvider } from '../providers/openai.js'
import { VolcengineProvider } from '../providers/volcengine.js'
import { XiaomiProvider } from '../providers/xiaomi.js'
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
    case 'openai':
      return new OpenAIProvider({
        apiKey: config.OPENAI_API_KEY,
        baseURL: config.OPENAI_BASE_URL,
        model: config.OPENAI_MODEL
      })
    case 'volcengine':
      return new VolcengineProvider({
        apiKey: config.VOLCENGINE_LLM_API_KEY,
        baseURL: config.VOLCENGINE_LLM_BASE_URL,
        model: config.VOLCENGINE_LLM_MODEL
      })
    case 'xiaomi':
      return new XiaomiProvider({
        apiKey: config.XIAOMI_API_KEY,
        baseURL: config.XIAOMI_BASE_URL,
        model: config.XIAOMI_MODEL
      })
    case 'mock':
      return new MockProvider()
    default:
      throw new Error(`不支持的 LLM 提供商: ${provider}。请在 .env 中设置正确的 LLM_PROVIDER。`)
  }
}
