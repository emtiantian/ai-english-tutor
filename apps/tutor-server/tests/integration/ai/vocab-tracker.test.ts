import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

describe('VocabTracker', () => {
  const env = createTestEnv('vocab-tracker')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('matches exact words case-insensitively', async () => {
    const { initSchema } = await import('@/db/index.js')
    initSchema()
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()

    const exact = tracker.analyzeUserText('I love apples', ['apples'])
    expect(exact.used).toEqual(['apples'])
    expect(exact.missed).toEqual([])
  })

  it('matches stemmed words', async () => {
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()
    const stemmed = tracker.analyzeUserText('I walked to school', ['walk'])
    expect(stemmed.used).toEqual(['walk'])
    expect(stemmed.missed).toEqual([])
  })

  it('fuzzy matches audio input within Levenshtein distance 2', async () => {
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()
    const fuzzy = tracker.analyzeUserText('I ate an aple', ['apple'], { isAudioInput: true })
    expect(fuzzy.used).toEqual(['apple'])
    expect(fuzzy.missed).toEqual([])
  })

  it('rejects too-distant fuzzy matches', async () => {
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()
    const missed = tracker.analyzeUserText('I ate an orange', ['apple'], { isAudioInput: true })
    expect(missed.used).toEqual([])
    expect(missed.missed).toEqual(['apple'])
  })

  it('skips invalid target words', async () => {
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()
    const invalid = tracker.analyzeUserText("' -", ["'", '-'])
    expect(invalid.used).toEqual([])
    expect(invalid.missed).toEqual([])
  })

  it('records progress and returns review words', async () => {
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()
    const userId = 'test-user-1'

    expect(tracker.getReviewWords(userId, 10).length).toBe(0)

    tracker.processTurn(userId, 'I study English every day', ['study', 'English'], [], 'A1')
    const progress = tracker.getProgress(userId)
    expect(progress.totalWords).toBe(2)
    expect(progress.learning).toBe(2)

    expect(tracker.getReviewWords(userId, 10).length).toBe(0)
  })

  it('builds empty review prompt', async () => {
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()
    expect(tracker.buildReviewPrompt([])).toBe('')
  })

  it('builds non-empty review prompt', async () => {
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    const tracker = new VocabTracker()
    const prompt = tracker.buildReviewPrompt([
      { word: 'study', level: 'A1', status: 'learning', contextCount: 0 },
    ])
    expect(prompt).toContain('study')
    expect(prompt).toContain('词汇复习')
  })
})
