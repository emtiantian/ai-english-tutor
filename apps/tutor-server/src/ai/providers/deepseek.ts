import { OpenAIBaseProvider, type OpenAIBaseProviderOptions } from './openai-base.js'

/**
 * DeepSeek Provider 构造选项。
 */
export interface DeepSeekProviderOptions
  extends Omit<OpenAIBaseProviderOptions, 'name' | 'capabilities'> {}

/**
 * DeepSeek LLM Provider。
 *
 * 基于 OpenAI 兼容接口，默认使用 DeepSeek 官方端点。
 * 如需使用火山方舟，建议改用 VolcengineProvider。
 */
export class DeepSeekProvider extends OpenAIBaseProvider {
  constructor(options: DeepSeekProviderOptions) {
    super({
      ...options,
      name: 'deepseek',
      capabilities: {
        supportsAudioInput: false,
        supportsStreaming: true,
      },
    })
  }
}
