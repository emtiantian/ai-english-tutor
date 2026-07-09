import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-voice-route-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')
process.env.LLM_PROVIDER = 'mock'
process.env.TTS_PROVIDER = 'browser'
process.env.ASR_PROVIDER = 'browser'

const Fastify = (await import('fastify')).default
const multipart = (await import('@fastify/multipart')).default
const { voiceRoutes } = await import('./voice.js')
const { config } = await import('../config.js')

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

async function main(): Promise<void> {
  const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 })
  await app.register(multipart, { limits: { fileSize: config.MAX_AUDIO_SIZE_MB * 1024 * 1024 } })
  await app.register(voiceRoutes)

  // ── POST /api/tts 文字转语音 ─────────────────────────────────

  const ttsMissing = await app.inject({
    method: 'POST',
    url: '/api/tts',
    payload: { text: '   ' },
  })
  assert.strictEqual(ttsMissing.statusCode, 400, 'empty text should return 400')
  const ttsMissingBody = JSON.parse(ttsMissing.body)
  assert.strictEqual(ttsMissingBody.code, 'MISSING_TEXT')

  const ttsOk = await app.inject({
    method: 'POST',
    url: '/api/tts',
    payload: { text: 'Hello', format: 'wav' },
  })
  assert.strictEqual(ttsOk.statusCode, 200, 'valid TTS should return 200')
  assert.strictEqual(ttsOk.headers['content-type'], 'audio/wav')
  assert.ok(ttsOk.rawPayload.length > 0)

  const ttsUnknownFormat = await app.inject({
    method: 'POST',
    url: '/api/tts',
    payload: { text: 'Hello', format: 'unknown' },
  })
  assert.strictEqual(ttsUnknownFormat.statusCode, 200)
  assert.strictEqual(ttsUnknownFormat.headers['content-type'], 'audio/mpeg', 'unknown format defaults to audio/mpeg')

  // ── POST /api/asr 语音转文字 ─────────────────────────────────

  const asrMissing = await app.inject({
    method: 'POST',
    url: '/api/asr',
    headers: { 'content-type': 'multipart/form-data; boundary=----Missing' },
    payload: '',
  })
  assert.strictEqual(asrMissing.statusCode, 400, 'missing audio should return 400')
  const asrMissingBody = JSON.parse(asrMissing.body)
  assert.strictEqual(asrMissingBody.code, 'MISSING_AUDIO')

  // 临时降低大小限制，以测试过大文件拒绝逻辑。
  const originalMaxAudio = config.MAX_AUDIO_SIZE_MB
  config.MAX_AUDIO_SIZE_MB = 0.001 // ~1 KB
  const asrLarge = await app.inject({
    method: 'POST',
    url: '/api/asr',
    headers: { 'content-type': 'multipart/form-data; boundary=----Large' },
    payload: buildMultipartBody('----Large', 'file', 'large.webm', 'audio/webm', Buffer.alloc(2048)),
  })
  assert.strictEqual(asrLarge.statusCode, 413, 'oversized audio should return 413')
  const asrLargeBody = JSON.parse(asrLarge.body)
  assert.strictEqual(asrLargeBody.code, 'AUDIO_TOO_LARGE')
  config.MAX_AUDIO_SIZE_MB = originalMaxAudio

  const asrOk = await app.inject({
    method: 'POST',
    url: '/api/asr',
    headers: { 'content-type': 'multipart/form-data; boundary=----Ok' },
    payload: buildMultipartBody('----Ok', 'file', 'test.webm', 'audio/webm', Buffer.alloc(1024)),
  })
  assert.strictEqual(asrOk.statusCode, 200, 'valid ASR should return 200')
  const asrOkBody = JSON.parse(asrOk.body)
  assert.strictEqual(asrOkBody.text, '', 'browser ASR returns empty transcript on server')

  // ── POST /api/translate-tts 翻译并语音合成 ──────────────────

  const translateMissing = await app.inject({
    method: 'POST',
    url: '/api/translate-tts',
    payload: { text: '' },
  })
  assert.strictEqual(translateMissing.statusCode, 400, 'empty translate text should return 400')
  const translateMissingBody = JSON.parse(translateMissing.body)
  assert.strictEqual(translateMissingBody.code, 'MISSING_TEXT')

  const translateOk = await app.inject({
    method: 'POST',
    url: '/api/translate-tts',
    payload: { text: 'Good morning' },
  })
  assert.strictEqual(translateOk.statusCode, 200, 'valid translate-tts should return 200')
  const translateOkBody = JSON.parse(translateOk.body)
  assert.ok(translateOkBody.audioBase64.length > 0)
  assert.ok(translateOkBody.translation.length > 0)

  await app.close()
  console.log('✅ voice route test passed')
}

main()
  .catch((err) => {
    console.error('❌ voice route test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
