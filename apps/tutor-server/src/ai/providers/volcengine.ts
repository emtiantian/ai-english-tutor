import { OpenAIBaseProvider, type OpenAIBaseProviderOptions } from './openai-base.js'

/**
 * 火山引擎（火山方舟）Provider 构造选项。
 */
export interface VolcengineProviderOptions
  extends Omit<OpenAIBaseProviderOptions, 'name' | 'capabilities'> {}

/**
 * 火山引擎（火山方舟）LLM Provider。
 *
 * 通过火山方舟 OpenAI 兼容接口调用 LLM，
 * 模型需填火山方舟「推理接入点 ID」，例如 ep-xxxxxxxxxxxxx。
 */
export class VolcengineProvider extends OpenAIBaseProvider {
  constructor(options: VolcengineProviderOptions) {
    super({
      ...options,
      name: 'volcengine',
      capabilities: {
        supportsAudioInput: false,
        supportsStreaming: true,
      },
    })
  }
}
