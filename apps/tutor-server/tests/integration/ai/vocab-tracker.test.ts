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

  it('does not count an unmentioned review word as an incorrect answer', async () => {
    const { initSchema, getDb } = await import('@/db/index.js')
    const { vocabRepo } = await import('@/db/repositories/vocabulary.js')
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    initSchema()
    const tracker = new VocabTracker()
    const userId = 'unmentioned-word-user'
    vocabRepo.recordEncounter(userId, 'coffee', 'A1')

    for (let i = 0; i < 3; i++) {
      tracker.processTurn(
        userId,
        'I would like some tea',
        [],
        [{ word: 'coffee', level: 'A1', status: 'learning', contextCount: 0 }],
        'A1'
      )
    }

    const row = getDb()
      .prepare(
        'SELECT incorrect_count, consecutive_incorrect, status FROM user_vocabulary WHERE user_id = ? AND word = ?'
      )
      .get(userId, 'coffee') as Record<string, unknown>
    expect(row.incorrect_count).toBe(0)
    expect(row.consecutive_incorrect).toBe(0)
    expect(row.status).toBe('learning')
  })

  it('marks a word mastered after three correct uses in distinct contexts', async () => {
    const { initSchema } = await import('@/db/index.js')
    const { vocabRepo } = await import('@/db/repositories/vocabulary.js')
    const { VocabTracker } = await import('@/ai/vocab-tracker.js')
    initSchema()
    const tracker = new VocabTracker()
    const userId = 'mastery-context-user'
    vocabRepo.recordEncounter(userId, 'coffee', 'A1')
    const reviewWord = {
      word: 'coffee',
      level: 'A1',
      status: 'learning' as const,
      contextCount: 0
    }

    tracker.processTurn(userId, 'I drink coffee every morning.', [], [reviewWord], 'A1')
    tracker.processTurn(userId, 'Could I order a coffee, please?', [], [reviewWord], 'A1')
    tracker.processTurn(userId, 'This coffee smells wonderful.', [], [reviewWord], 'A1')

    const word = vocabRepo.getAllWords(userId).find(item => item.word === 'coffee')
    expect(word?.contextCount).toBe(3)
    expect(word?.status).toBe('mastered')

    vocabRepo.recordEncounter(userId, 'coffee', 'A2')
    expect(vocabRepo.getAllWords(userId).find(item => item.word === 'coffee')?.status).toBe(
      'mastered'
    )
  })
})
