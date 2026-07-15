import { getDb } from '../index.js'
import { UserVocabularyTable } from '../schema/tables.js'
import type { InferRow } from '../schema/types.js'
import { parseJsonColumn, stringifyJsonColumn } from '../schema/helpers.js'

const C = UserVocabularyTable.columns

/** 从 schema 推导的用户词汇数据库行类型（编译期检查用）。 */
export type UserVocabularyRow = InferRow<typeof UserVocabularyTable>

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
   * 为用户记录一个单词（插入或更新）。
   * 新单词在首次复习前会有 10 分钟延迟。
   */
  recordWord(userId: string, word: string, level: string, status: WordStatus = 'learning'): void {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    const nextReview = now + 600 // 新单词延迟 10 分钟

    const existing = db.prepare(
      `SELECT ${C.id.name} FROM ${UserVocabularyTable.name}
       WHERE ${C.user_id.name} = ? AND ${C.word.name} = ?`,
    ).get(userId, word.toLowerCase()) as { id: number } | undefined

    if (existing) {
      db.prepare(
        `UPDATE ${UserVocabularyTable.name}
         SET ${C.status.name} = ?, ${C.level.name} = ?, ${C.updated_at.name} = ?
         WHERE ${C.id.name} = ?`,
      ).run(status, level, now, existing.id)
    } else {
      db.prepare(
        `INSERT INTO ${UserVocabularyTable.name}
         (${C.user_id.name}, ${C.word.name}, ${C.level.name}, ${C.status.name},
          ${C.review_count.name}, ${C.correct_count.name}, ${C.incorrect_count.name},
          ${C.consecutive_incorrect.name}, ${C.context_count.name}, ${C.contexts.name},
          ${C.last_review_at.name}, ${C.next_review_at.name}, ${C.created_at.name})
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, '[]', NULL, ?, ?)`,
      ).run(userId, word.toLowerCase(), level, status, nextReview, now)
    }
  },

  /**
   * 复习后更新单词状态。
   *
   * 掌握规则：
   * - correct_count >= 3 且 context_count >= 3 → mastered
   * - consecutive_incorrect >= 3 → forgotten（连续答错 3 次视为遗忘）
   * - 其他 → learning
   *
   * 间隔递进（基于 correct_count 的确定性规则）：
   *   0 次正确 → 1 小时
   *   1 次正确 → 1 天
   *   2 次正确 → 3 天
   *   3 次正确 → 7 天
   *   4+ 次正确 → 14 天
   */
  reviewWord(userId: string, word: string, correct: boolean): void {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    const row = db.prepare(
      `SELECT ${C.correct_count.name}, ${C.incorrect_count.name},
              ${C.consecutive_incorrect.name}, ${C.context_count.name}
       FROM ${UserVocabularyTable.name}
       WHERE ${C.user_id.name} = ? AND ${C.word.name} = ?`,
    ).get(userId, word.toLowerCase()) as Record<string, number> | undefined

    if (!row) return

    const newCorrectCount = correct ? row.correct_count + 1 : row.correct_count
    const newIncorrectCount = correct ? row.incorrect_count : row.incorrect_count + 1
    const newConsecutiveIncorrect = correct ? 0 : row.consecutive_incorrect + 1

    let status: WordStatus
    if (newConsecutiveIncorrect >= 3) {
      status = 'forgotten'
    } else if (newCorrectCount >= 3 && row.context_count >= 3) {
      status = 'mastered'
    } else {
      status = 'learning'
    }

    const nextReview = calculateNextReview(correct, newCorrectCount)

    db.prepare(
      `UPDATE ${UserVocabularyTable.name}
       SET ${C.review_count.name} = ${C.review_count.name} + 1,
           ${C.correct_count.name} = ?,
           ${C.incorrect_count.name} = ?,
           ${C.consecutive_incorrect.name} = ?,
           ${C.status.name} = ?,
           ${C.last_review_at.name} = ?,
           ${C.next_review_at.name} = ?
       WHERE ${C.user_id.name} = ? AND ${C.word.name} = ?`,
    ).run(newCorrectCount, newIncorrectCount, newConsecutiveIncorrect, status, now, nextReview, userId, word.toLowerCase())
  },

  /**
   * 获取到期的复习单词。
   * 排除已掌握单词，按 next_review_at 升序排列。
   */
  getDueForReview(
    userId: string,
    limit: number = 10,
  ): Array<{ word: string; level: string; status: WordStatus; contextCount: number }> {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)
    const rows = db.prepare(
      `SELECT ${C.word.name}, ${C.level.name}, ${C.status.name}, ${C.context_count.name}
       FROM ${UserVocabularyTable.name}
       WHERE ${C.user_id.name} = ? AND ${C.status.name} != 'mastered'
         AND (${C.next_review_at.name} IS NULL OR ${C.next_review_at.name} <= ?)
       ORDER BY ${C.next_review_at.name} ASC
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
   * 为单词添加一条语境描述。
   * 若语境已存在则返回 false。
   */
  addContext(userId: string, word: string, contextDesc: string): boolean {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    const row = db.prepare(
      `SELECT ${C.contexts.name} FROM ${UserVocabularyTable.name}
       WHERE ${C.user_id.name} = ? AND ${C.word.name} = ?`,
    ).get(userId, word.toLowerCase()) as { contexts: string } | undefined

    if (!row) return false

    const contexts: string[] = parseJsonColumn(row.contexts) ?? []

    const normalizedDesc = contextDesc.toLowerCase().trim()
    if (contexts.some((c) => c.toLowerCase().trim() === normalizedDesc)) {
      return false
    }

    contexts.push(contextDesc)
    db.prepare(
      `UPDATE ${UserVocabularyTable.name}
       SET ${C.context_count.name} = ?, ${C.contexts.name} = ?, ${C.updated_at.name} = ?
       WHERE ${C.user_id.name} = ? AND ${C.word.name} = ?`,
    ).run(contexts.length, stringifyJsonColumn(contexts), now, userId, word.toLowerCase())

    return true
  },

  /**
   * 获取用户的词汇进度摘要。
   */
  getProgress(userId: string): VocabProgress {
    const db = getDb()
    const now = Math.floor(Date.now() / 1000)

    const result = db.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ${C.status.name} = 'mastered' THEN 1 ELSE 0 END) as mastered,
        SUM(CASE WHEN ${C.status.name} = 'learning' THEN 1 ELSE 0 END) as learning,
        SUM(CASE WHEN ${C.status.name} = 'forgotten' THEN 1 ELSE 0 END) as forgotten,
        SUM(CASE WHEN ${C.status.name} != 'mastered' AND (${C.next_review_at.name} IS NULL OR ${C.next_review_at.name} <= ?) THEN 1 ELSE 0 END) as due_for_review
       FROM ${UserVocabularyTable.name} WHERE ${C.user_id.name} = ?`,
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
   * 获取用户的所有单词。
   */
  getAllWords(userId: string): Array<{ word: string; level: string; status: WordStatus; contextCount: number; contexts: string[] }> {
    const db = getDb()
    const rows = db.prepare(
      `SELECT ${C.word.name}, ${C.level.name}, ${C.status.name}, ${C.context_count.name}, ${C.contexts.name}
       FROM ${UserVocabularyTable.name}
       WHERE ${C.user_id.name} = ?`,
    ).all(userId) as Record<string, unknown>[]

    return rows.map((r) => ({
      word: String(r.word),
      level: String(r.level),
      status: String(r.status) as WordStatus,
      contextCount: Number(r.context_count),
      contexts: parseJsonColumn<string[]>(String(r.contexts)) ?? [],
    }))
  },
}

/**
 * 基于 correct_count 的确定性间隔重复算法。
 *
 *   correct_count 0 → 1 小时（重新学习）
 *   correct_count 1 → 1 天
 *   correct_count 2 → 3 天
 *   correct_count 3 → 7 天
 *   correct_count 4+ → 14 天
 *
 * 回答错误时：重置为 1 小时。
 */
function calculateNextReview(correct: boolean, correctCount: number): number {
  const now = Math.floor(Date.now() / 1000)

  if (!correct) {
    return now + 3600 // 1 小时
  }

  const intervals = [3600, 86400, 259200, 604800, 1209600]
  const index = Math.min(correctCount, intervals.length - 1)
  return now + intervals[index]
}
