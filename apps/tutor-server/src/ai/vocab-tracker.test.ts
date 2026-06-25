import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-vocab-tracker-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

const { initSchema } = await import('../db/index.js')
const { VocabTracker } = await import('./vocab-tracker.js')

async function main(): Promise<void> {
  initSchema()
  const tracker = new VocabTracker()
  const userId = 'test-user-1'

  // ── analyzeUserText ───────────────────────────────────────

  // Exact match (case-insensitive)
  const exact = tracker.analyzeUserText('I love apples', ['apples'])
  assert.deepStrictEqual(exact.used, ['apples'])
  assert.deepStrictEqual(exact.missed, [])

  // Stemmed match: "walked" should match target "walk"
  const stemmed = tracker.analyzeUserText('I walked to school', ['walk'])
  assert.deepStrictEqual(stemmed.used, ['walk'])
  assert.deepStrictEqual(stemmed.missed, [])

  // Fuzzy match for audio input (Levenshtein distance ≤ 2)
  const fuzzy = tracker.analyzeUserText('I ate an aple', ['apple'], { isAudioInput: true })
  assert.deepStrictEqual(fuzzy.used, ['apple'])
  assert.deepStrictEqual(fuzzy.missed, [])

  // Too different even for fuzzy
  const missed = tracker.analyzeUserText('I ate an orange', ['apple'], { isAudioInput: true })
  assert.deepStrictEqual(missed.used, [])
  assert.deepStrictEqual(missed.missed, ['apple'])

  // Invalid target words (regex injection / non-words) should be skipped
  const invalid = tracker.analyzeUserText("' -", ["'", '-'])
  assert.deepStrictEqual(invalid.used, [])
  assert.deepStrictEqual(invalid.missed, [])

  // ── processTurn ───────────────────────────────────────────

  const reviewWords = tracker.getReviewWords(userId, 10)
  assert.strictEqual(reviewWords.length, 0, 'no words due before any are recorded')

  tracker.processTurn(userId, 'I study English every day', ['study', 'English'], [], 'A1')
  const progress = tracker.getProgress(userId)
  assert.strictEqual(progress.totalWords, 2)
  assert.strictEqual(progress.learning, 2)

  // Newly recorded words have a 10-minute delay before first review
  const due = tracker.getReviewWords(userId, 10)
  assert.strictEqual(due.length, 0, 'new words are not due immediately')

  // ── buildReviewPrompt ─────────────────────────────────────

  const emptyPrompt = tracker.buildReviewPrompt([])
  assert.strictEqual(emptyPrompt, '')

  const prompt = tracker.buildReviewPrompt([
    { word: 'study', level: 'A1', status: 'learning', contextCount: 0 },
  ])
  assert(prompt.includes('study'))
  assert(prompt.includes('VOCABULARY REVIEW'))

  console.log('✅ vocab-tracker test passed')
}

main()
  .catch((err) => {
    console.error('❌ vocab-tracker test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })
