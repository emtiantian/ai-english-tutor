import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'
import { createSSEServer, collectSSE } from '@tests/helpers/sse.js'
import { AudioPipeline } from '@/ai/audio-pipeline.js'
import type { LLMProvider, LLMResponse } from '@/ai/llm/types.js'
import type { TTSProvider, TTSSynthesizeOptions } from '@/voice/tts.js'
import type { ASRProvider, ASRResult } from '@/voice/asr.js'

function createMockProviders(audioInput = false): {
  tts: TTSProvider
  asr: ASRProvider
  llm: LLMProvider
} {
  return {
    tts: {
      name: 'mock-tts',
      outputFormat: 'wav',
      async synthesize(_text: string, _options?: TTSSynthesizeOptions): Promise<Buffer> {
        return Buffer.alloc(12288, 0xab)
      }
    },
    asr: {
      name: 'mock-asr',
      async transcribe(_audioBuffer: Buffer, _mimeType?: string): Promise<ASRResult> {
        return { text: 'mock transcription', confidence: 0.9, language: 'en' }
      }
    },
    llm: {
      name: 'mock-llm',
      capabilities: { supportsAudioInput: audioInput, supportsStreaming: false },
      async complete(): Promise<LLMResponse> {
        return { content: 'mock response' }
      }
    }
  }
}

describe('AudioPipeline', () => {
  const env = createTestEnv('audio-pipeline')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('returns original text when no audio is provided', async () => {
    const { tts, asr, llm } = createMockProviders()
    const pipeline = new AudioPipeline(tts, asr, llm)
    expect(await pipeline.transcribeAudio('hello', undefined, 'webm')).toBe('hello')
  })

  it('skips ASR when LLM supports audio input', async () => {
    const { tts, asr } = createMockProviders()
    const audioLlm = createMockProviders(true).llm
    const audioPipeline = new AudioPipeline(tts, asr, audioLlm)
    expect(await audioPipeline.transcribeAudio('hello', 'base64data', 'webm')).toBe('hello')
  })

  it('uses ASR when audio is provided but LLM does not support audio input', async () => {
    const { tts, asr, llm } = createMockProviders()
    const pipeline = new AudioPipeline(tts, asr, llm)
    const asrResult = await pipeline.transcribeAudio('hello', 'base64data', 'webm')
    expect(asrResult).toBe('mock transcription')
  })

  it('synthesizes direct audio', async () => {
    const { tts, asr, llm } = createMockProviders()
    const pipeline = new AudioPipeline(tts, asr, llm)
    const direct = await pipeline.synthesizeDirect('hello')
    expect(direct.length).toBe(12288)
  })

  it('handles output audio as base64', async () => {
    const { tts, asr, llm } = createMockProviders()
    const pipeline = new AudioPipeline(tts, asr, llm)
    const output = await pipeline.handleOutput('hello', undefined, undefined)
    expect(output.audioBase64).toBeDefined()
    expect(Buffer.from(output.audioBase64!, 'base64').length).toBe(12288)
  })

  it('broadcasts audio chunks via SSE', async () => {
    const { tts, asr, llm } = createMockProviders()
    const pipeline = new AudioPipeline(tts, asr, llm)

    const { server, port } = await createSSEServer()
    const sessionId = 'audio-test-session'

    const collector = await collectSSE(
      `http://localhost:${port}/api/chat/stream?sessionId=${sessionId}`,
      { minEvents: 1 }
    )

    const audioBuffer = Buffer.alloc(12288, 0xcd)
    pipeline.broadcastAudioChunksDirect(audioBuffer, 'mp3', sessionId, 'teacher.audio')

    await new Promise(resolve => setTimeout(resolve, 200))

    const audioEvents = collector.events.filter(e => e.event === 'teacher.audio')
    expect(audioEvents.length).toBe(2)

    const first = audioEvents[0].data as { audioBase64: string; format: string; isEnd: boolean }
    const second = audioEvents[1].data as { audioBase64: string; format: string; isEnd: boolean }
    expect(first.format).toBe('mp3')
    expect(first.isEnd).toBe(false)
    expect(second.isEnd).toBe(true)
    expect(Buffer.from(first.audioBase64, 'base64').length).toBe(6144)
    expect(Buffer.from(second.audioBase64, 'base64').length).toBe(6144)

    collector.req.destroy()
    await server.close()
  })
})
