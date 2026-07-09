import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { ASRProvider, ASRResult } from '../asr.js'

/**
 * Whisper.cpp ASR 服务商
 *
 * 连接本地部署的 whisper.cpp HTTP 服务。
 * 免费、自托管，可在 CPU 或 GPU 上运行。
 *
 * Docker 部署：
 *   docker run -d --name whisper -p 8080:8080 \
 *     -v $(pwd)/models:/models \
 *     ghcr.io/ggerganov/whisper.cpp:main \
 *     -m /models/ggml-base.en.bin --host 0.0.0.0 --port 8080
 *
 * 模型下载：
 *   curl -L -o models/ggml-base.en.bin \
 *     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
 */
export class WhisperASRProvider implements ASRProvider {
  readonly name = 'whisper'
  private baseUrl: string

  constructor() {
    this.baseUrl = config.WHISPER_BASE_URL
    logger.info({ baseUrl: this.baseUrl }, 'Whisper.cpp ASR 提供商初始化完成')
  }

  async transcribe(audioBuffer: Buffer, mimeType?: string): Promise<ASRResult> {
    logger.debug(
      { provider: this.name, size: audioBuffer.length, mimeType },
      'Whisper 转写请求',
    )

    const ext = this.getExtensionFromMimeType(mimeType)
    const filename = `audio.${ext}`

    // 构建 multipart form-data
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

    logger.info({ url, audioSize: audioBuffer.length, mimeType }, '[Whisper ASR] 发送请求...')

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error({ err: errMsg, url }, '[Whisper ASR] 连接失败 — whisper.cpp 服务是否已启动？')
      throw new Error(`Whisper ASR 连接失败：${errMsg}。请确认 whisper.cpp 服务是否已在 ${this.baseUrl} 启动`)
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      logger.error({ status: response.status, errorText: errorText.slice(0, 200) }, '[Whisper ASR] 服务器返回错误')
      throw new Error(`Whisper ASR 错误：${response.status} - ${errorText}`)
    }

    const result = (await response.json()) as WhisperResponse
    const duration = Date.now() - startTime

    logger.info(
      { provider: this.name, duration, text: result.text?.slice(0, 100), textLength: result.text?.length ?? 0 },
      '[Whisper ASR] 转写完成',
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

/** whisper.cpp 服务端响应格式 */
interface WhisperResponse {
  text?: string
  language?: string
  duration?: number
}
