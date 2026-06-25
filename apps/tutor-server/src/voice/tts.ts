import { config } from '../config.js'
import { logger } from '../logger.js'
import { CosyVoiceProvider } from './providers/cosyvoice.js'
import { XiaomiTTSProvider } from './providers/xiaomi-tts.js'

/**
 * TTS (Text-to-Speech) Provider Interface
 */
export interface TTSProvider {
  readonly name: string

  /**
   * Synthesize text to speech audio
   * Returns the audio data as a Buffer
   */
  synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer>

  /**
   * Stream synthesize text to speech audio
   * Yields audio chunks as they are generated
   */
  synthesizeStream?(text: string, options?: TTSSynthesizeOptions): AsyncGenerator<Buffer>
}

export interface TTSSynthesizeOptions {
  /** Voice ID */
  voice?: string

  /** Audio format: mp3 | opus | aac | flac | wav | pcm */
  format?: string

  /** Speed multiplier: 0.25 ~ 4.0 */
  speed?: number

  /** Voice design description for TTS providers that support it (e.g. Xiaomi VoiceDesign) */
  voiceDesign?: string
}

/**
 * Browser TTS Provider (placeholder / fallback for direct API calls).
 *
 * When TTS_PROVIDER=browser, the real audio output is produced by the frontend
 * via the Web Speech API; the backend does not synthesize. This provider only
 * returns a silent WAV so that standalone `/api/tts` calls do not crash.
 */
class BrowserTTSProvider implements TTSProvider {
  readonly name = 'browser'

  async synthesize(_text: string, _options?: TTSSynthesizeOptions): Promise<Buffer> {
    logger.debug({ browser: true }, 'Browser TTS synthesize (silent fallback)')
    // Return a minimal valid silent WAV so downstream audio decoders don't fail.
    await new Promise((resolve) => setTimeout(resolve, 300))
    return generateSilentWav()
  }
}

/**
 * Generate a minimal valid WAV file containing silence.
 * Useful for browser TTS fallback where no real API audio is produced.
 */
function generateSilentWav(): Buffer {
  const sampleRate = 16000
  const channels = 1
  const bitsPerSample = 16
  const durationSeconds = 0.1
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const dataSize = Math.floor(sampleRate * durationSeconds) * blockAlign
  const fileSize = 36 + dataSize

  const buffer = Buffer.alloc(44 + dataSize)
  let offset = 0

  // RIFF chunk descriptor
  buffer.write('RIFF', offset); offset += 4
  buffer.writeUInt32LE(fileSize, offset); offset += 4
  buffer.write('WAVE', offset); offset += 4

  // fmt sub-chunk
  buffer.write('fmt ', offset); offset += 4
  buffer.writeUInt32LE(16, offset); offset += 4 // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, offset); offset += 2 // AudioFormat (PCM)
  buffer.writeUInt16LE(channels, offset); offset += 2
  buffer.writeUInt32LE(sampleRate, offset); offset += 4
  buffer.writeUInt32LE(byteRate, offset); offset += 4
  buffer.writeUInt16LE(blockAlign, offset); offset += 2
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2

  // data sub-chunk (silence already zeroed by Buffer.alloc)
  buffer.write('data', offset); offset += 4
  buffer.writeUInt32LE(dataSize, offset); offset += 4

  return buffer
}

/**
 * Create TTS provider based on configuration
 */
export function createTTSProvider(): TTSProvider {
  const provider = config.TTS_PROVIDER

  switch (provider) {
    case 'xiaomi':
      return new XiaomiTTSProvider()
    case 'cosyvoice':
      return new CosyVoiceProvider()
    case 'browser':
      // 浏览器输出：前端走 SpeechSynthesis，后端不合成。这里仅作兜底。
      return new BrowserTTSProvider()
    default:
      logger.warn({ provider }, 'Unknown TTS provider, falling back to browser')
      return new BrowserTTSProvider()
  }
}
