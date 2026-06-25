import assert from 'node:assert'
import http from 'node:http'
import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerSSE } from '../sse/handler.js'
import { AudioPipeline } from './audio-pipeline.js'
import type { LLMProvider } from './llm.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../voice/tts.js'
import type { ASRProvider, ASRResult } from '../voice/asr.js'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-audio-pipeline-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

function createSSEServer(): Promise<{ server: FastifyInstance; port: number }> {
  return new Promise((resolve, reject) => {
    const server = Fastify({ logger: false })
    registerSSE(server)
      .then(() => server.listen({ port: 0 }))
      .then(() => {
        const address = server.server.address()
        const port =
          typeof address === 'string' ? parseInt(address.split(':').pop()!, 10) : address!.port
        resolve({ server, port })
      })
      .catch(reject)
  })
}

function collectSSE(url: string): Promise<{ events: Array<{ event?: string; data: unknown }>; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const events: Array<{ event?: string; data: unknown }> = []
    const req = http.get(url, (res) => {
      let buffer = ''
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const lines = part.split('\n')
          let event: string | undefined
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7)
            else if (line.startsWith('data: ')) data = line.slice(6)
          }
          if (data) {
            try {
              events.push({ event, data: JSON.parse(data) })
            } catch {
              events.push({ event, data })
            }
          }
        }
      })
      // Resolve once we have some events; caller will destroy request
      const timeout = setTimeout(() => resolve({ events, req }), 500)
      res.on('end', () => {
        clearTimeout(timeout)
        resolve({ events, req })
      })
    })
    req.on('error', reject)
  })
}

function createMockProviders(audioInput = false): {
  tts: TTSProvider
  asr: ASRProvider
  llm: LLMProvider
} {
  return {
    tts: {
      name: 'mock-tts',
      async synthesize(_text: string, _options?: TTSSynthesizeOptions): Promise<Buffer> {
        // Return a 12288-byte buffer so it splits into exactly 2 chunks
        return Buffer.alloc(12288, 0xab)
      },
    },
    asr: {
      name: 'mock-asr',
      async transcribe(_audioBuffer: Buffer, _mimeType?: string): Promise<ASRResult> {
        return { text: 'mock transcription', confidence: 0.9, language: 'en' }
      },
    },
    llm: {
      name: 'mock-llm',
      capabilities: { supportsAudioInput: audioInput, supportsStreaming: false },
      async complete(): Promise<{ content: string }> {
        return { content: 'mock response' }
      },
    },
  }
}

async function main(): Promise<void> {
  const { tts, asr, llm } = createMockProviders()
  const pipeline = new AudioPipeline(tts, asr, llm)

  // transcribeAudio: no audio returns original text
  assert.strictEqual(await pipeline.transcribeAudio('hello', undefined, 'webm'), 'hello')

  // transcribeAudio: LLM supports audio input → skip ASR
  const audioLlm = createMockProviders(true).llm
  const audioPipeline = new AudioPipeline(tts, asr, audioLlm)
  assert.strictEqual(await audioPipeline.transcribeAudio('hello', 'base64data', 'webm'), 'hello')

  // transcribeAudio: audio provided, LLM does not support audio → use ASR
  const asrResult = await pipeline.transcribeAudio('hello', 'base64data', 'webm')
  assert.strictEqual(asrResult, 'mock transcription')

  // synthesizeDirect returns a buffer
  const direct = await pipeline.synthesizeDirect('hello')
  assert.strictEqual(direct.length, 12288)

  // handleOutput returns base64 audio
  const output = await pipeline.handleOutput('hello', undefined, undefined)
  assert(output.audioBase64)
  assert.strictEqual(Buffer.from(output.audioBase64, 'base64').length, 12288)

  // ── broadcastAudioChunksDirect ────────────────────────────

  const { server, port } = await createSSEServer()
  const sessionId = 'audio-test-session'

  const collector = await collectSSE(`http://localhost:${port}/api/chat/stream?sessionId=${sessionId}`)

  // Skip config + heartbeat events
  const audioBuffer = Buffer.alloc(12288, 0xcd)
  pipeline.broadcastAudioChunksDirect(audioBuffer, 'mp3', sessionId, 'teacher.audio')

  // Wait a tick for broadcasts to land
  await new Promise((resolve) => setTimeout(resolve, 200))

  const audioEvents = collector.events.filter((e) => e.event === 'teacher.audio')
  assert.strictEqual(audioEvents.length, 2, '12288 bytes should split into 2 chunks of 6144')

  const first = audioEvents[0].data as { audioBase64: string; format: string; isEnd: boolean }
  const second = audioEvents[1].data as { audioBase64: string; format: string; isEnd: boolean }
  assert.strictEqual(first.format, 'mp3')
  assert.strictEqual(first.isEnd, false)
  assert.strictEqual(second.isEnd, true)
  assert.strictEqual(Buffer.from(first.audioBase64, 'base64').length, 6144)
  assert.strictEqual(Buffer.from(second.audioBase64, 'base64').length, 6144)

  collector.req.destroy()
  await server.close()

  console.log('✅ audio-pipeline test passed')
}

main()
  .catch((err) => {
    console.error('❌ audio-pipeline test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
