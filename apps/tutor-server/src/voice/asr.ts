import { config } from '../config.js'
import { logger } from '../logger.js'
import { BrowserASRProvider } from './providers/browser-asr.js'
import { WhisperASRProvider } from './providers/whisper-asr.js'
import { XiaomiASRProvider } from './providers/xiaomi-asr.js'

/**
 * ASR (Automatic Speech Recognition) Provider Interface
 */
export interface ASRProvider {
  readonly name: string

  /**
   * Transcribe audio to text
   * @param audioBuffer - Audio file buffer
   * @param mimeType - MIME type of the audio file
   */
  transcribe(audioBuffer: Buffer, mimeType?: string): Promise<ASRResult>
}

export interface ASRResult {
  /** Transcribed text */
  text: string

  /** Confidence score (0-1) if available */
  confidence?: number

  /** Detected language */
  language?: string
}

/**
 * Create ASR provider based on configuration
 */
export function createASRProvider(): ASRProvider {
  const provider = config.ASR_PROVIDER

  switch (provider) {
    case 'whisper':
      return new WhisperASRProvider()
    case 'xiaomi':
      return new XiaomiASRProvider()
    case 'browser':
      return new BrowserASRProvider()
    default:
      logger.warn({ provider }, 'Unknown ASR provider, falling back to browser')
      return new BrowserASRProvider()
  }
}

/**
 * Return the currently configured ASR provider name.
 * Used by the /api/config endpoint.
 */
export function getConfiguredASRProvider(): string {
  return config.ASR_PROVIDER ?? 'browser'
}
