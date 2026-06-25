import { logger } from '../../logger.js'
import type { ASRProvider, ASRResult } from '../asr.js'

/**
 * Browser ASR Provider
 *
 * When ASR_PROVIDER=browser, the actual speech-to-text happens in the frontend
 * via the Web Speech API. If the server endpoint is called anyway, we return an
 * empty transcript as a safe fallback instead of crashing the request.
 */
export class BrowserASRProvider implements ASRProvider {
  readonly name = 'browser'

  async transcribe(_audioBuffer: Buffer, _mimeType?: string): Promise<ASRResult> {
    logger.warn(
      { provider: this.name },
      '[ASR] Browser ASR received audio on the server; returning empty transcript',
    )
    return { text: '', confidence: 0, language: 'en' }
  }
}
