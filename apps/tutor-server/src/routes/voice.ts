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
 * Voice API routes
 *
 * POST /api/tts    - Text-to-Speech: returns audio file
 * POST /api/asr    - Speech-to-Text: accepts audio file, returns transcription
 */
export async function voiceRoutes(server: FastifyInstance): Promise<void> {
  const tts = createTTSProvider()
  const asr = createASRProvider()
  const llm = createLLMProvider()

  /**
   * POST /api/tts
   * Convert text to speech audio
   *
   * Request body: { text: string, voice?: string, format?: string, speed?: number }
   * Response: audio file (Content-Type based on format)
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
        'TTS request',
      )

      try {
        const audioBuffer = await tts.synthesize(text, {
          voice,
          format,
          speed,
        })

        const responseFormat = format ?? config.TTS_FORMAT
        const contentType = getAudioContentType(responseFormat)

        return reply
          .header('Content-Type', contentType)
          .header('Content-Length', audioBuffer.length)
          .send(audioBuffer)
      } catch (err) {
        logger.error({ err }, 'TTS failed')
        return reply.status(500).send({
          error: err instanceof Error ? err.message : 'TTS failed',
          code: 'TTS_ERROR',
        })
      }
    },
  )

  /**
   * GET /api/tts/stats
   * TTS cache effectiveness: in-process hit/miss counters + on-disk footprint.
   * Use to gauge how much TTS spend the cache is saving and whether reuse works.
   */
  server.get('/api/tts/stats', async (_request, reply) => {
    const disk = await getCacheDiskUsage()
    return reply.send({ ...getCacheStats(), cache: disk })
  })

  /**
   * POST /api/asr
   * Convert speech audio to text
   *
   * Request: multipart/form-data with audio file
   * Response: { text: string, confidence?: number, language?: string }
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
      'ASR request',
    )

    try {
      // Accumulate size while reading chunks so we can reject oversized uploads early.
      const chunks: Buffer[] = []
      const maxSize = config.MAX_AUDIO_SIZE_MB * 1024 * 1024
      let totalSize = 0
      for await (const chunk of data.file) {
        totalSize += chunk.length
        if (totalSize > maxSize) {
          return reply.status(413).send({
            error: `Audio file too large. Max size: ${config.MAX_AUDIO_SIZE_MB}MB`,
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
      logger.error({ err }, 'ASR failed')
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'ASR failed',
        code: 'ASR_ERROR',
      })
    }
  })

  /**
   * POST /api/translate-tts
   * Translate English text to Chinese and synthesize with warm Taiwanese female voice.
   *
   * Request body: { text: string }
   * Response: { audioBase64: string, translation: string }
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

      logger.info({ textLength: text.length }, 'Translate-TTS request')

      try {
        // Step 1: Translate English to Chinese using LLM (with timeout)
        const translateMessages: LLMMessage[] = [
          {
            role: 'system',
            content:
              'You are a translator. Translate the given English text to natural Simplified Chinese. ' +
              'Return ONLY the Chinese translation, no explanations, no quotes, no extra text.',
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
          'Translation complete',
        )

        // Step 2: Synthesize Chinese TTS with warm Taiwanese female voice
        const zhVoiceDesign = config.XIAOMI_TTS_ZH_VOICE_DESIGN
        logger.info({ zhVoiceDesign: zhVoiceDesign?.slice(0, 50) }, 'Using Chinese voice design')
        const audioBuffer = await tts.synthesize(translation, {
          voiceDesign: zhVoiceDesign,
          format: config.TTS_FORMAT,
        })

        const audioBase64 = audioBuffer.toString('base64')

        logger.info(
          { translationLength: translation.length, audioSize: audioBuffer.length },
          'Translate-TTS complete',
        )

        return reply.send({ audioBase64, translation })
      } catch (err) {
        logger.error({ err }, 'Translate-TTS failed')
        return reply.status(500).send({
          error: err instanceof Error ? err.message : 'Translate-TTS failed',
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
