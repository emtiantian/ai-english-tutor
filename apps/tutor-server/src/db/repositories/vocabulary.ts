import { getDb } from '../index.js'

export type WordStatus = 'learning' | 'mastered' | 'forgotten'

export interface UserVocabulary {
  id: number
  userId: string
  word: string
  level: string
  status: WordStatus
  reviewCount: number
  correctCount: number
  incorrectCount: number
  consecutiveIncorrect: number
  contextCount: number
  contexts: string[]
  lastReviewAt: Date | null
  nextReviewAt: Date | null
  createdAt: Date
}

export interface VocabProgress {
  totalWords: number
  mastered: number
  learning: number
  forgotten: number
  dueForReview: number
  masteryRate: number
}

export const vocabRepo = {
  /**
   * Record a word for a user (upsert).
   * New words get a 10-minute delay before first review.
   */
  recordWord(userId: string, word: string, level: string, status: WordStatus = 'learning'): void {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    const nextReview = now + 600 // 10 minutes delay for new words

    const existing = db.prepare(
      'SELECT id FROM user_vocabulary WHERE user_id = ? AND word = ?',
    ).get(userId, word.toLowerCase()) as { id: number } | undefined

    if (existing) {
      db.prepare(
        `UPDATE user_vocabulary
         SET status = ?, level = ?, updated_at = ?
         WHERE id = ?`,
      ).run(status, level, now, existing.id)
    } else {
      db.prepare(
        `INSERT INTO user_vocabulary
         (user_id, word, level, status, review_count, correct_count, incorrect_count,
          consecutive_incorrect, context_count, contexts, last_review_at, next_review_at, created_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '[]', NULL, ?, ?)`,
      ).run(userId, word.toLowerCase(), level, status, nextReview, now)
    }
  },

  /**
   * Update word status after review.
   *
   * Mastery rules:
   * - correct_count >= 3 AND context_count >= 3 → mastered
   * - consecutive_incorrect >= 3 → forgotten
   * - otherwise → learning
   *
   * Interval progression (deterministic based on correct_count):
   *   0 correct → 1 hour
   *   1 correct → 1 day
   *   2 correct → 3 days
   *   3 correct → 7 days
   *   4+ correct → 14 days
   */
  reviewWord(userId: string, word: string, correct: boolean): void {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    // Get current state
    const row = db.prepare(
      `SELECT correct_count, incorrect_count, consecutive_incorrect, context_count
       FROM user_vocabulary WHERE user_id = ? AND word = ?`,
    ).get(userId, word.toLowerCase()) as Record<string, number> | undefined

    if (!row) return

    const newCorrectCount = correct ? row.correct_count + 1 : row.correct_count
    const newIncorrectCount = correct ? row.incorrect_count : row.incorrect_count + 1
    const newConsecutiveIncorrect = correct ? 0 : row.consecutive_incorrect + 1

    // Determine status
    let status: WordStatus
    if (newConsecutiveIncorrect >= 3) {
      status = 'forgotten'
    } else if (newCorrectCount >= 3 && row.context_count >= 3) {
      status = 'mastered'
    } else {
      status = 'learning'
    }

    // Calculate next review interval
    const nextReview = calculateNextReview(correct, newCorrectCount)

    db.prepare(
      `UPDATE user_vocabulary
       SET review_count = review_count + 1,
           correct_count = ?,
           incorrect_count = ?,
           consecutive_incorrect = ?,
           status = ?,
           last_review_at = ?,
           next_review_at = ?
       WHERE user_id = ? AND word = ?`,
    ).run(newCorrectCount, newIncorrectCount, newConsecutiveIncorrect, status, now, nextReview, userId, word.toLowerCase())
  },

  /**
   * Get words due for review.
   * Excludes mastered words. Orders by next_review_at ascending.
   */
  getDueForReview(
    userId: string,
    limit: number = 10,
  ): Array<{ word: string; level: string; status: WordStatus; contextCount: number }> {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    const rows = db.prepare(
      `SELECT word, level, status, context_count FROM user_vocabulary
       WHERE user_id = ? AND status != 'mastered' AND (next_review_at IS NULL OR next_review_at <= ?)
       ORDER BY next_review_at ASC
       LIMIT ?`,
    ).all(userId, now, limit) as Record<string, unknown>[]

    return rows.map((r) => ({
      word: String(r.word),
      level: String(r.level),
      status: String(r.status) as WordStatus,
      contextCount: Number(r.context_count),
    }))
  },

  /**
   * Add a context description for a word.
   * Returns true if the context is new (not a duplicate).
   */
  addContext(userId: string, word: string, contextDesc: string): boolean {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    const row = db.prepare(
      'SELECT contexts FROM user_vocabulary WHERE user_id = ? AND word = ?',
    ).get(userId, word.toLowerCase()) as { contexts: string } | undefined

    if (!row) return false

    const contexts: string[] = JSON.parse(row.contexts || '[]')

    // Check for duplicate (simple string match)
    const normalizedDesc = contextDesc.toLowerCase().trim()
    if (contexts.some((c) => c.toLowerCase().trim() === normalizedDesc)) {
      return false
    }

    contexts.push(contextDesc)
    db.prepare(
      `UPDATE user_vocabulary
       SET context_count = ?, contexts = ?, updated_at = ?
       WHERE user_id = ? AND word = ?`,
    ).run(contexts.length, JSON.stringify(contexts), now, userId, word.toLowerCase())

    return true
  },

  /**
   * Get user's progress summary.
   */
  getProgress(userId: string): VocabProgress {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    const result = db.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END) as mastered,
        SUM(CASE WHEN status = 'learning' THEN 1 ELSE 0 END) as learning,
        SUM(CASE WHEN status = 'forgotten' THEN 1 ELSE 0 END) as forgotten,
        SUM(CASE WHEN status != 'mastered' AND (next_review_at IS NULL OR next_review_at <= ?) THEN 1 ELSE 0 END) as due_for_review
       FROM user_vocabulary WHERE user_id = ?`,
    ).get(now, userId) as Record<string, number | null>

    const total = Number(result.total) || 0
    const mastered = Number(result.mastered) || 0

    return {
      totalWords: total,
      mastered,
      learning: Number(result.learning) || 0,
      forgotten: Number(result.forgotten) || 0,
      dueForReview: Number(result.due_for_review) || 0,
      masteryRate: total > 0 ? Math.round((mastered / total) * 100) : 0,
    }
  },

  /**
   * Get all words for a user.
   */
  getAllWords(userId: string): Array<{ word: string; level: string; status: WordStatus; contextCount: number; contexts: string[] }> {
    const db = getDb()
    const rows = db.prepare(
      'SELECT word, level, status, context_count, contexts FROM user_vocabulary WHERE user_id = ?',
    ).all(userId) as Record<string, unknown>[]

    return rows.map((r) => ({
      word: String(r.word),
      level: String(r.level),
      status: String(r.status) as WordStatus,
      contextCount: Number(r.context_count),
      contexts: JSON.parse(String(r.contexts || '[]')),
    }))
  },
}

/**
 * Deterministic spaced repetition intervals based on correct_count.
 *
 *   correct_count 0 → 1 hour (re-learn)
 *   correct_count 1 → 1 day
 *   correct_count 2 → 3 days
 *   correct_count 3 → 7 days
 *   correct_count 4+ → 14 days
 *
 * On incorrect answer: reset to 1 hour.
 */
function calculateNextReview(correct: boolean, correctCount: number): number {
  const now = Math.floor(Date.now() / 1000)

  if (!correct) {
    return now + 3600 // 1 hour
  }

  const intervals = [3600, 86400, 259200, 604800, 1209600]
  const index = Math.min(correctCount, intervals.length - 1)
  return now + intervals[index]
}
