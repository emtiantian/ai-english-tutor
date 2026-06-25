import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { ASRProvider, ASRResult } from '../asr.js'

/**
 * Whisper.cpp ASR Provider
 *
 * Connects to a locally deployed whisper.cpp HTTP server.
 * Free, self-hosted, runs on CPU or GPU.
 *
 * Docker deployment:
 *   docker run -d --name whisper -p 8080:8080 \
 *     -v $(pwd)/models:/models \
 *     ghcr.io/ggerganov/whisper.cpp:main \
 *     -m /models/ggml-base.en.bin --host 0.0.0.0 --port 8080
 *
 * Model download:
 *   curl -L -o models/ggml-base.en.bin \
 *     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
 */
export class WhisperASRProvider implements ASRProvider {
  readonly name = 'whisper'
  private baseUrl: string

  constructor() {
    this.baseUrl = config.WHISPER_BASE_URL
    logger.info({ baseUrl: this.baseUrl }, 'Whisper.cpp ASR provider initialized')
  }

  async transcribe(audioBuffer: Buffer, mimeType?: string): Promise<ASRResult> {
    logger.debug(
      { provider: this.name, size: audioBuffer.length, mimeType },
      'Whisper transcribe request',
    )

    const ext = this.getExtensionFromMimeType(mimeType)
    const filename = `audio.${ext}`

    // Build multipart form-data
    const formData = new FormData()
    formData.append(
      'file',
      new Blob([audioBuffer], { type: mimeType ?? 'audio/webm' }),
      filename,
    )

    const language = config.ASR_LANGUAGE === 'auto' ? undefined : config.ASR_LANGUAGE
    if (language) {
      formData.append('language', language)
    }
    formData.append('response_format', 'json')

    const startTime = Date.now()
    const url = `${this.baseUrl}/inference`

    logger.info({ url, audioSize: audioBuffer.length, mimeType }, '[Whisper ASR] Sending request...')

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error({ err: errMsg, url }, '[Whisper ASR] Connection failed — is the whisper.cpp server running?')
      throw new Error(`Whisper ASR connection failed: ${errMsg}. Is the whisper.cpp server running at ${this.baseUrl}?`)
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      logger.error({ status: response.status, errorText: errorText.slice(0, 200) }, '[Whisper ASR] Server returned error')
      throw new Error(`Whisper ASR error: ${response.status} - ${errorText}`)
    }

    const result = (await response.json()) as WhisperResponse
    const duration = Date.now() - startTime

    logger.info(
      { provider: this.name, duration, text: result.text?.slice(0, 100), textLength: result.text?.length ?? 0 },
      '[Whisper ASR] Transcription complete',
    )

    return {
      text: result.text ?? '',
      language: result.language ?? language ?? 'en',
    }
  }

  private getExtensionFromMimeType(mimeType?: string): string {
    const map: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
      'audio/x-m4a': 'm4a',
    }
    return map[mimeType ?? ''] ?? 'webm'
  }
}

/** whisper.cpp server response format */
interface WhisperResponse {
  text?: string
  language?: string
  duration?: number
}
