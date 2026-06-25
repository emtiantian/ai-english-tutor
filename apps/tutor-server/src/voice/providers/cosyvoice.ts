import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../tts.js'
import { getOrSynthesizeCachedAudio } from '../tts-cache.js'

/** Available built-in voices for CosyVoice */
export const COSYVOICE_VOICES = [
  '英文女', // Female English voice (default for teaching)
  '英文男', // Male English voice
  '中文女', // Female Chinese voice
  '中文男', // Male Chinese voice
] as const

export type CosyVoiceId = (typeof COSYVOICE_VOICES)[number]

/**
 * Teaching voice selection strategy based on student level
 */
export function selectTeachingVoice(level?: number): CosyVoiceId {
  if (!level || level <= 2) return '英文女' // Gentle female voice for beginners
  if (level <= 4) return '英文男' // Clear male voice for intermediate
  return '英文女' // Professional female voice for advanced
}

/**
 * Wrap raw mono 16-bit little-endian PCM into a minimal WAV (RIFF) container.
 *
 * The CosyVoice fastapi `server.py` streams *headerless* int16 PCM
 * (`(tts_speech.numpy() * 2**15).astype(np.int16).tobytes()`), so the bytes are
 * not playable by browsers / `decodeAudioData` as-is. Prepending a 44-byte WAV
 * header makes the output a self-describing, universally decodable audio buffer.
 */
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  let offset = 0

  header.write('RIFF', offset); offset += 4
  header.writeUInt32LE(36 + dataSize, offset); offset += 4
  header.write('WAVE', offset); offset += 4

  header.write('fmt ', offset); offset += 4
  header.writeUInt32LE(16, offset); offset += 4 // PCM fmt chunk size
  header.writeUInt16LE(1, offset); offset += 2 // audio format = PCM
  header.writeUInt16LE(channels, offset); offset += 2
  header.writeUInt32LE(sampleRate, offset); offset += 4
  header.writeUInt32LE(byteRate, offset); offset += 4
  header.writeUInt16LE(blockAlign, offset); offset += 2
  header.writeUInt16LE(bitsPerSample, offset); offset += 2

  header.write('data', offset); offset += 4
  header.writeUInt32LE(dataSize, offset)

  return Buffer.concat([header, pcm])
}

/**
 * CosyVoice TTS Provider
 *
 * Connects to a locally or remotely deployed CosyVoice fastapi service
 * (`runtime/python/fastapi/server.py`). Works with the SFT model
 * (CosyVoice-300M-SFT) whose built-in speakers (英文女 / 英文男 / ...) drive
 * the `/inference_sft` endpoint.
 *
 * IMPORTANT — server contract (`server.py`):
 * - Endpoints accept **multipart/form-data** fields, NOT a JSON body.
 *   `/inference_sft`      → tts_text, spk_id
 *   `/inference_instruct` → tts_text, spk_id, instruct_text
 * - The response is a raw int16 mono PCM stream (no container), so we wrap it
 *   into WAV here. The PCM sample rate is model-specific (config.COSYVOICE_SAMPLE_RATE;
 *   300M-SFT = 22050, CosyVoice2-0.5B = 24000).
 * - This build of server.py has no `speed` parameter; we still send it as a
 *   form field so newer server builds that support it pick it up (FastAPI
 *   silently ignores unknown form fields).
 *
 * Docker deployment (SFT model):
 *   docker run -d --name cosyvoice --gpus all -p 50000:50000 \
 *     -v ~/.cache/modelscope:/root/.cache/modelscope \
 *     -w /workspace/CosyVoice/runtime/python/fastapi \
 *     --entrypoint /opt/conda/envs/cosyvoice/bin/python \
 *     cosyvoice:local server.py --port 50000 --model_dir iic/CosyVoice-300M-SFT
 */
export class CosyVoiceProvider implements TTSProvider {
  readonly name = 'cosyvoice'
  private baseUrl: string

  constructor() {
    this.baseUrl = config.COSYVOICE_BASE_URL
    logger.info({ baseUrl: this.baseUrl }, 'CosyVoice provider initialized')
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer> {
    return getOrSynthesizeCachedAudio(text, options?.voiceDesign, async () => {
      const voice = options?.voice ?? config.COSYVOICE_SPK_ID
      const speed = options?.speed ?? config.COSYVOICE_SPEED

      logger.debug(
        { provider: this.name, voice, speed, textLength: text.length },
        'CosyVoice synthesize request',
      )

      const startTime = Date.now()

      const form = new FormData()
      form.append('tts_text', text)
      form.append('spk_id', voice)
      form.append('speed', String(speed))

      const response = await fetch(`${this.baseUrl}/inference_sft`, {
        method: 'POST',
        body: form,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error')
        throw new Error(`CosyVoice TTS error: ${response.status} - ${errorText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = pcmToWav(Buffer.from(arrayBuffer), config.COSYVOICE_SAMPLE_RATE)
      const duration = Date.now() - startTime

      logger.info(
        { provider: this.name, duration, size: buffer.length },
        'CosyVoice synthesize complete',
      )

      return buffer
    })
  }

  async *synthesizeStream(
    text: string,
    options?: TTSSynthesizeOptions,
  ): AsyncGenerator<Buffer> {
    // The server streams headerless PCM; individual chunks are not independently
    // decodable, so we buffer the whole response, wrap it once in a WAV header,
    // and yield a single playable buffer.
    yield await this.synthesize(text, options)
  }

  /**
   * Synthesize with emotion instruction (unique to CosyVoice)
   *
   * @param text - Text to synthesize
   * @param instruct - Emotion instruction in natural language, e.g.:
   *   "用温暖鼓励的语气说" (warm and encouraging)
   *   "用耐心但认真的语气说" (patient but serious)
   *   "用清晰缓慢的语气说" (clear and slow)
   */
  async synthesizeWithEmotion(
    text: string,
    instruct: string,
    options?: TTSSynthesizeOptions,
  ): Promise<Buffer> {
    const voice = options?.voice ?? config.COSYVOICE_SPK_ID
    const speed = options?.speed ?? config.COSYVOICE_SPEED

    logger.debug(
      { provider: this.name, voice, speed, instruct, textLength: text.length },
      'CosyVoice synthesize with emotion',
    )

    const startTime = Date.now()

    const form = new FormData()
    form.append('tts_text', text)
    form.append('spk_id', voice)
    form.append('instruct_text', instruct)
    form.append('speed', String(speed))

    const response = await fetch(`${this.baseUrl}/inference_instruct`, {
      method: 'POST',
      body: form,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      throw new Error(`CosyVoice instruct error: ${response.status} - ${errorText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = pcmToWav(Buffer.from(arrayBuffer), config.COSYVOICE_SAMPLE_RATE)
    const duration = Date.now() - startTime

    logger.info(
      { provider: this.name, duration, size: buffer.length, instruct },
      'CosyVoice instruct complete',
    )

    return buffer
  }
}
