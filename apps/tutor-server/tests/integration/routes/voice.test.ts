import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { createTestEnv } from '@tests/helpers/env.js'

function buildMultipartBody(
  boundary: string,
  fieldName: string,
  filename: string,
  contentType: string,
  data: Buffer,
): Buffer {
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    'utf8',
  )
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  return Buffer.concat([prefix, data, suffix])
}

describe('voice routes', () => {
  const env = createTestEnv('voice-routes')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('rejects TTS with empty text', async () => {
    const { config } = await import('@/config.js')
    const { voiceRoutes } = await import('@/routes/voice.js')

    const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 })
    await app.register(multipart, { limits: { fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024 } })
    await app.register(voiceRoutes)

    const ttsMissing = await app.inject({
      method: 'POST',
      url: '/api/tts',
      payload: { text: '   ' },
    })

    expect(ttsMissing.statusCode).toBe(400)
    const body = JSON.parse(ttsMissing.body)
    expect(body.code).toBe('MISSING_TEXT')

    await app.close()
  })

  it('returns WAV audio for valid TTS', async () => {
    const { config } = await import('@/config.js')
    const { voiceRoutes } = await import('@/routes/voice.js')

    const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 })
    await app.register(multipart, { limits: { fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024 } })
    await app.register(voiceRoutes)

    const ttsOk = await app.inject({
      method: 'POST',
      url: '/api/tts',
      payload: { text: 'Hello', format: 'wav' },
    })

    expect(ttsOk.statusCode).toBe(200)
    expect(ttsOk.headers['content-type']).toBe('audio/wav')
    expect(ttsOk.rawPayload.length).toBeGreaterThan(0)

    await app.close()
  })

  it('defaults unknown TTS format to audio/mpeg', async () => {
    const { config } = await import('@/config.js')
    const { voiceRoutes } = await import('@/routes/voice.js')

    const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 })
    await app.register(multipart, { limits: { fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024 } })
    await app.register(voiceRoutes)

    const ttsUnknownFormat = await app.inject({
      method: 'POST',
      url: '/api/tts',
      payload: { text: 'Hello', format: 'unknown' },
    })

    expect(ttsUnknownFormat.statusCode).toBe(200)
    expect(ttsUnknownFormat.headers['content-type']).toBe('audio/mpeg')

    await app.close()
  })

  it('rejects ASR with missing audio', async () => {
    const { config } = await import('@/config.js')
    const { voiceRoutes } = await import('@/routes/voice.js')

    const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 })
    await app.register(multipart, { limits: { fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024 } })
    await app.register(voiceRoutes)

    const asrMissing = await app.inject({
      method: 'POST',
      url: '/api/asr',
      headers: { 'content-type': 'multipart/form-data; boundary=----Missing' },
      payload: '',
    })

    expect(asrMissing.statusCode).toBe(400)
    const body = JSON.parse(asrMissing.body)
    expect(body.code).toBe('MISSING_AUDIO')

    await app.close()
  })

  it('rejects oversized ASR audio', async () => {
    const { config } = await import('@/config.js')
    const { voiceRoutes } = await import('@/routes/voice.js')

    const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 })
    await app.register(multipart, { limits: { fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024 } })
    await app.register(voiceRoutes)

    const originalMaxAudio = config.MAX_AUDIO_SIZE_MB
    config.MAX_AUDIO_SIZE_MB = 0.001

    const asrLarge = await app.inject({
      method: 'POST',
      url: '/api/asr',
      headers: { 'content-type': 'multipart/form-data; boundary=----Large' },
      payload: buildMultipartBody('----Large', 'file', 'large.webm', 'audio/webm', Buffer.alloc(2048)),
    })

    expect(asrLarge.statusCode).toBe(413)
    const body = JSON.parse(asrLarge.body)
    expect(body.code).toBe('AUDIO_TOO_LARGE')

    config.MAX_AUDIO_SIZE_MB = originalMaxAudio
    await app.close()
  })

  it('returns empty transcript for browser ASR', async () => {
    const { config } = await import('@/config.js')
    const { voiceRoutes } = await import('@/routes/voice.js')

    const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 })
    await app.register(multipart, { limits: { fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024 } })
    await app.register(voiceRoutes)

    const asrOk = await app.inject({
      method: 'POST',
      url: '/api/asr',
      headers: { 'content-type': 'multipart/form-data; boundary=----Ok' },
      payload: buildMultipartBody('----Ok', 'file', 'test.webm', 'audio/webm', Buffer.alloc(1024)),
    })

    expect(asrOk.statusCode).toBe(200)
    const body = JSON.parse(asrOk.body)
    expect(body.text).toBe('')

    await app.close()
  })
})
