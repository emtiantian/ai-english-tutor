import { OpenAIBaseProvider, type OpenAIBaseProviderOptions } from './openai-base.js'

/**
 * OpenAI Provider 构造选项。
 */
export interface OpenAIProviderOptions extends Omit<
  OpenAIBaseProviderOptions,
  'name' | 'capabilities'
> {}

/**
 * OpenAI 官方 LLM Provider。
 *
 * 基于 OpenAI 兼容接口，默认使用 OpenAI 官方端点。
 * 也可通过 baseURL 指向任意 OpenAI 兼容服务（如 Azure OpenAI、第三方网关）。
 */
export class OpenAIProvider extends OpenAIBaseProvider {
  constructor(options: OpenAIProviderOptions) {
    super({
      ...options,
      name: 'openai',
      capabilities: {
        supportsAudioInput: false,
        supportsStreaming: true
      }
    })
  }
}
