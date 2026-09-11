import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'
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

  it('surfaces ASR failure when there is no fallback transcript', async () => {
    const { tts, llm } = createMockProviders()
    const asr: ASRProvider = {
      name: 'failing-asr',
      async transcribe() {
        throw new Error('provider unavailable')
      }
    }
    const pipeline = new AudioPipeline(tts, asr, llm)

    await expect(pipeline.transcribeAudio('', 'base64data', 'webm')).rejects.toThrow(
      '语音识别失败，请重试'
    )
  })

  it('handles output audio as base64', async () => {
    const { tts, asr, llm } = createMockProviders()
    const pipeline = new AudioPipeline(tts, asr, llm)
    const output = await pipeline.handleOutput('hello', undefined, undefined)
    expect(output.audioBase64).toBeDefined()
    expect(Buffer.from(output.audioBase64!, 'base64').length).toBe(12288)
  })

  it('does not return or broadcast audio after the request is aborted', async () => {
    const { asr, llm } = createMockProviders()
    let finishSynthesis!: (value: Buffer) => void
    const tts: TTSProvider = {
      name: 'slow-tts',
      outputFormat: 'wav',
      synthesize: () => new Promise(resolve => (finishSynthesis = resolve))
    }
    const pipeline = new AudioPipeline(tts, asr, llm)
    const controller = new AbortController()

    const pending = pipeline.handleOutput(
      'old response',
      undefined,
      'session',
      'request-old',
      controller.signal
    )
    controller.abort()
    finishSynthesis(Buffer.from('old audio'))

    await expect(pending).resolves.toEqual({})
  })
})
