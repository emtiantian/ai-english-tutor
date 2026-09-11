import type { FastifyInstance, FastifyRequest } from 'fastify'
import { logger } from '../logger.js'
import { createTTSProvider } from '../voice/tts.js'

interface TTSRequestBody {
  text: string
  voice?: string
  format?: string
  speed?: number
}

/**
 * 语音 API 路由
 *
 * POST /api/tts    - 文字转语音：返回音频文件
 */
export async function voiceRoutes(server: FastifyInstance): Promise<void> {
  const tts = createTTSProvider()

  /**
   * POST /api/tts
   * 将文字转换为语音音频
   *
   * 请求体：{ text: string, voice?: string, format?: string, speed?: number }
   * 响应：音频文件（Content-Type 根据 format 决定）
   */
  server.post('/api/tts', async (request: FastifyRequest<{ Body: TTSRequestBody }>, reply) => {
    const { text, voice, format, speed } = request.body

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({
        error: 'Text is required',
        code: 'MISSING_TEXT'
      })
    }

    logger.info({ provider: tts.name, textLength: text.length, voice, format }, 'TTS 请求')

    try {
      const audioBuffer = await tts.synthesize(text, {
        voice,
        format,
        speed
      })

      // 用 provider 实际产出格式作为 Content-Type，保证与返回字节一致。
      const responseFormat = format ?? tts.outputFormat
      const contentType = getAudioContentType(responseFormat)

      return reply
        .header('Content-Type', contentType)
        .header('Content-Length', audioBuffer.length)
        .send(audioBuffer)
    } catch (err) {
      logger.error({ err }, 'TTS 合成失败')
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'TTS 合成失败',
        code: 'TTS_ERROR'
      })
    }
  })
}

function getAudioContentType(format: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    opus: 'audio/opus',
    aac: 'audio/aac',
    flac: 'audio/flac',
    wav: 'audio/wav',
    pcm: 'audio/pcm',
    webm: 'audio/webm'
  }
  return map[format] ?? 'audio/mpeg'
}
