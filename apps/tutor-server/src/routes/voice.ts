import type { FastifyInstance, FastifyRequest } from 'fastify'
import { logger } from '../logger.js'
import { createTTSProvider } from '../voice/tts.js'
import { createASRProvider } from '../voice/asr.js'
import { getCacheStats, getCacheDiskUsage } from '../voice/tts-cache.js'
import { createLLMProvider, type LLMMessage } from '../ai/llm.js'
import { config } from '../config.js'

interface TTSRequestBody {
  text: string
  voice?: string
  format?: string
  speed?: number
}

interface TranslateTTSRequestBody {
  text: string
}

interface ASRResponse {
  text: string
  confidence?: number
  language?: string
}

/**
 * 语音 API 路由
 *
 * POST /api/tts    - 文字转语音：返回音频文件
 * POST /api/asr    - 语音转文字：接收音频文件并返回转写文本
 */
export async function voiceRoutes(server: FastifyInstance): Promise<void> {
  const tts = createTTSProvider()
  const asr = createASRProvider()
  const llm = createLLMProvider()

  /**
   * POST /api/tts
   * 将文字转换为语音音频
   *
   * 请求体：{ text: string, voice?: string, format?: string, speed?: number }
   * 响应：音频文件（Content-Type 根据 format 决定）
   */
  server.post(
    '/api/tts',
    async (request: FastifyRequest<{ Body: TTSRequestBody }>, reply) => {
      const { text, voice, format, speed } = request.body

      if (!text || text.trim().length === 0) {
        return reply.status(400).send({
          error: 'Text is required',
          code: 'MISSING_TEXT',
        })
      }

      logger.info(
        { provider: tts.name, textLength: text.length, voice, format },
        'TTS 请求',
      )

      try {
        const audioBuffer = await tts.synthesize(text, {
          voice,
          format,
          speed,
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
          code: 'TTS_ERROR',
        })
      }
    },
  )

  /**
   * GET /api/tts/stats
   * TTS 缓存效果：进程内命中/未命中计数 + 磁盘占用。
   * 用于衡量缓存节省了多少 TTS 开销，以及复用是否生效。
   */
  server.get('/api/tts/stats', async (_request, reply) => {
    const disk = await getCacheDiskUsage()
    return reply.send({ ...getCacheStats(), cache: disk })
  })

  /**
   * POST /api/asr
   * 将语音音频转换为文字
   *
   * 请求：multipart/form-data，包含音频文件
   * 响应：{ text: string, confidence?: number, language?: string }
   */
  server.post('/api/asr', async (request, reply) => {
    const data = await request.file()

    if (!data) {
      return reply.status(400).send({
        error: 'Audio file is required',
        code: 'MISSING_AUDIO',
      })
    }

    logger.info(
      { provider: asr.name, filename: data.filename, mimetype: data.mimetype },
      'ASR 请求',
    )

    try {
      // 读取分片时累计大小，以便尽早拒绝过大的上传文件。
      const chunks: Buffer[] = []
      const maxSize = config.MAX_AUDIO_SIZE_MB * 1024 * 1024
      let totalSize = 0
      for await (const chunk of data.file) {
        totalSize += chunk.length
        if (totalSize > maxSize) {
          return reply.status(413).send({
            error: `音频文件过大，最大 ${config.MAX_AUDIO_SIZE_MB}MB`,
            code: 'AUDIO_TOO_LARGE',
          })
        }
        chunks.push(chunk)
      }
      const audioBuffer = Buffer.concat(chunks)

      const result = await asr.transcribe(audioBuffer, data.mimetype)

      const response: ASRResponse = {
        text: result.text,
        confidence: result.confidence,
        language: result.language,
      }

      return reply.send(response)
    } catch (err) {
      logger.error({ err }, 'ASR 识别失败')
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'ASR 识别失败',
        code: 'ASR_ERROR',
      })
    }
  })

  /**
   * POST /api/translate-tts
   * 将英文文本翻译为中文，并用温暖的台湾女声合成语音。
   *
   * 请求体：{ text: string }
   * 响应：{ audioBase64: string, translation: string }
   */
  server.post(
    '/api/translate-tts',
    async (request: FastifyRequest<{ Body: TranslateTTSRequestBody }>, reply) => {
      const { text } = request.body

      if (!text || text.trim().length === 0) {
        return reply.status(400).send({
          error: 'Text is required',
          code: 'MISSING_TEXT',
        })
      }

      logger.info({ textLength: text.length }, '翻译 TTS 请求')

      try {
        // 步骤 1：使用 LLM 将英文翻译为中文（带超时）
        const translateMessages: LLMMessage[] = [
          {
            role: 'system',
            content:
              '你是一名翻译助手。请将给定的英文文本翻译成自然的简体中文。' +
              '只返回中文译文，不要解释、不要引号、不要额外内容。',
          },
          { role: 'user', content: text },
        ]

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        let translationResponse: { content: string }
        try {
          translationResponse = await llm.complete(translateMessages, controller.signal)
        } finally {
          clearTimeout(timeoutId)
        }
        const translation = translationResponse.content.trim()

        logger.info(
          { originalLength: text.length, translationLength: translation.length },
          '翻译完成',
        )

        // 步骤 2：合成中文 TTS。
        // voiceDesign 仅对 xiaomi voicedesign/voiceclone 模式有效；
        // volcengine（固定 speaker）/cosyvoice（内置音色）传入会被忽略甚至导致异常，
        // 因此做 provider-aware 处理：仅 xiaomi 传中文音色设计，其余用 provider 默认音色。
        const zhVoiceDesign =
          tts.name === 'xiaomi' ? config.XIAOMI_TTS_ZH_VOICE_DESIGN : undefined
        if (zhVoiceDesign) {
          logger.info({ zhVoiceDesign: zhVoiceDesign.slice(0, 50) }, '使用中文音色设计')
        }
        const audioBuffer = await tts.synthesize(translation, {
          voiceDesign: zhVoiceDesign,
          format: tts.outputFormat,
        })

        const audioBase64 = audioBuffer.toString('base64')

        logger.info(
          { translationLength: translation.length, audioSize: audioBuffer.length },
          '翻译 TTS 完成',
        )

        return reply.send({ audioBase64, translation })
      } catch (err) {
        logger.error({ err }, '翻译 TTS 失败')
        return reply.status(500).send({
          error: err instanceof Error ? err.message : '翻译 TTS 失败',
          code: 'TRANSLATE_TTS_ERROR',
        })
      }
    },
  )
}

function getAudioContentType(format: string): string {
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    opus: 'audio/opus',
    aac: 'audio/aac',
    flac: 'audio/flac',
    wav: 'audio/wav',
    pcm: 'audio/pcm',
    webm: 'audio/webm',
  }
  return map[format] ?? 'audio/mpeg'
}
