import { afterEach, describe, expect, it } from 'vitest'
import { recognizeSpeech } from '../../src/audio/browser-asr.js'

interface FakeRecognitionResult extends Array<{ transcript: string; confidence: number }> {
  isFinal: boolean
}

class FakeRecognition {
  static current: FakeRecognition | undefined

  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((event: { results: FakeRecognitionResult[]; resultIndex: number }) => void) | null =
    null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null

  constructor() {
    FakeRecognition.current = this
  }

  start() {}
  abort() {}
  stop() {
    this.onend?.()
  }
}

function result(transcript: string): FakeRecognitionResult {
  const value = [{ transcript, confidence: 1 }] as FakeRecognitionResult
  value.isFinal = true
  return value
}

describe('browser ASR', () => {
  afterEach(() => {
    delete window.webkitSpeechRecognition
    FakeRecognition.current = undefined
  })

  it('combines every final result before resolving on stop', async () => {
    window.webkitSpeechRecognition = FakeRecognition as never
    const stopController = new AbortController()
    const pending = recognizeSpeech({ stopSignal: stopController.signal })
    const recognition = FakeRecognition.current

    expect(recognition?.continuous).toBe(true)
    recognition?.onresult?.({
      resultIndex: 0,
      results: [result('I want to go'), result('to the train station')]
    })
    stopController.abort()

    await expect(pending).resolves.toMatchObject({
      transcript: 'I want to go to the train station'
    })
  })
})
