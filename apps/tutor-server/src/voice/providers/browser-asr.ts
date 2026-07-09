import { logger } from '../../logger.js'
import type { ASRProvider, ASRResult } from '../asr.js'

/**
 * 浏览器 ASR Provider
 *
 * 当 ASR_PROVIDER=browser 时，真正的语音转文字在前端通过 Web Speech API 完成。
 * 如果服务器端接口仍被调用，返回空转写作为安全兜底，而不是让请求崩溃。
 */
export class BrowserASRProvider implements ASRProvider {
  readonly name = 'browser'

  async transcribe(_audioBuffer: Buffer, _mimeType?: string): Promise<ASRResult> {
    logger.warn(
      { provider: this.name },
      '[ASR] 浏览器 ASR 在服务端收到音频，返回空转写',
    )
    return { text: '', confidence: 0, language: 'en' }
  }
}
