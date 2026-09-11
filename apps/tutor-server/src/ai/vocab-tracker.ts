import { logger } from '../logger.js'
import { vocabRepo, type WordStatus } from '../db/repositories/vocabulary.js'

export interface ReviewWord {
  word: string
  level: string
  status: WordStatus
  contextCount: number
}

export interface VocabAnalysis {
  /** 复习列表中出现在用户文本里的词 */
  usedWords: string[]
  /** 复习列表中用户未掌握的词 */
  missedWords: string[]
  /** AI 引入的新词汇（来自 LLM 响应） */
  newWords: string[]
}

/**
 * 对话中用于间隔重复的词汇跟踪器。
 *
 * 跟踪用户遇到了哪些词、在多少不同语境中见过，并据此安排复习。
 *
 * 支持：
 * - 文本输入：精确匹配 + 词干匹配
 * - 音频输入：模糊匹配以容忍 ASR 错误
 */
export class VocabTracker {
  /**
   * 获取用户到期需复习的词汇。
   */
  getReviewWords(userId: string, limit: number = 5): ReviewWord[] {
    const dueWords = vocabRepo.getDueForReview(userId, limit)
    return dueWords
  }

  /**
   * 分析用户文本，检查是否使用了目标词汇。
   *
   * 匹配策略：
   * 1. 精确匹配（不区分大小写）
   * 2. 词干匹配 — 去除常见英文后缀以捕获变体
   * 3. 音频输入：额外尝试 Levenshtein 距离 ≤ 2（容忍 ASR 错误）
   */
  analyzeUserText(
    userText: string,
    targetWords: string[],
    options: { isAudioInput?: boolean } = {}
  ): { used: string[]; missed: string[] } {
    const normalizedText = userText.toLowerCase()
    const tokens = normalizedText.split(/\s+/).map(t => t.replace(/[^a-z']/g, ''))
    const used: string[] = []
    const missed: string[] = []

    for (const word of targetWords) {
      const normalizedWord = word.toLowerCase()

      // 拒绝包含安全字符集以外字符的词，防止恶意/篡改的词汇数据导致正则注入和 ReDoS。
      if (!isValidWord(normalizedWord)) {
        logger.warn({ word }, '词汇：跳过无效目标词')
        continue
      }

      let found = false

      // 1. 精确匹配
      const exactRegex = new RegExp(`\\b${escapeRegex(normalizedWord)}\\b`, 'i')
      if (exactRegex.test(normalizedText)) {
        found = true
      }

      // 2. 词干匹配 — 检查是否有 token 共享同一词干
      if (!found) {
        const wordStem = simpleStem(normalizedWord)
        found = tokens.some(token => simpleStem(token) === wordStem)
      }

      // 3. 音频输入：模糊匹配（Levenshtein 距离 ≤ 2）
      if (!found && options.isAudioInput) {
        const MAX_FUZZY_LEN = 50
        const clampedWord = normalizedWord.slice(0, MAX_FUZZY_LEN)
        found = tokens.some(token => {
          const clampedToken = token.slice(0, MAX_FUZZY_LEN)
          if (Math.abs(clampedToken.length - clampedWord.length) > 2) return false
          return levenshtein(clampedToken, clampedWord) <= 2
        })
      }

      if (found) {
        used.push(word)
      } else {
        missed.push(word)
      }
    }

    return { used, missed }
  }

  /**
   * 处理一轮对话后的词汇。
   */
  processTurn(
    userId: string,
    userText: string,
    aiResponseWords: string[],
    reviewWords: ReviewWord[],
    level: string,
    options: { isAudioInput?: boolean } = {}
  ): VocabAnalysis {
    const targetWords = reviewWords.map(w => w.word)
    const { used, missed } = this.analyzeUserText(userText, targetWords, options)

    // 标记正确使用的词
    for (const word of used) {
      // 先记录独立语境，再更新复习结果，使第三个不同语境可以触发 mastered。
      vocabRepo.addContext(userId, word, userText.trim())
      vocabRepo.reviewWord(userId, word, true)
      logger.info({ userId, word, isAudio: options.isAudioInput }, '词汇：用户使用了复习词')
    }

    // 本轮没有出现不代表答错：自由对话可能根本没有给用户使用这些词的机会。
    for (const word of missed) {
      logger.debug({ userId, word }, '词汇：本轮未考察复习词，不更新复习结果')
    }

    // 记录 AI 响应中的新词
    const newWords: string[] = []
    const existingWords = new Set(vocabRepo.getAllWords(userId).map(item => item.word))
    for (const word of aiResponseWords) {
      const normalizedWord = word.toLowerCase()
      if (!existingWords.has(normalizedWord)) {
        vocabRepo.recordEncounter(userId, word, level)
        existingWords.add(normalizedWord)
        newWords.push(word)
        logger.info({ userId, word, level }, '词汇：已记录新词')
      }
    }

    return { usedWords: used, missedWords: missed, newWords }
  }

  /**
   * 获取用户的词汇进度摘要。
   */
  getProgress(userId: string) {
    return vocabRepo.getProgress(userId)
  }
}

// ── 辅助函数 ──────────────────────────────────────────────

/** 转义特殊正则字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 验证单词只包含正则匹配的安全字符。 */
function isValidWord(word: string): boolean {
  return /^[a-z0-9]+([ '-][a-z0-9]+)*$/i.test(word)
}

/**
 * 简单的英文词干提取器 — 去除常见后缀。
 * 不如 Porter/Snowball 精确，但足以满足词汇匹配。
 */
function simpleStem(word: string): string {
  // 顺序很重要：长的后缀优先
  const suffixes = [
    'tion',
    'sion',
    'ment',
    'ness',
    'able',
    'ible',
    'ful',
    'less',
    'ous',
    'ive',
    'ing',
    'ied',
    'ies',
    'ers',
    'est',
    'ly',
    'ed',
    'er',
    'es',
    's'
  ]

  let stem = word
  for (const suffix of suffixes) {
    if (stem.length > suffix.length + 2 && stem.endsWith(suffix)) {
      stem = stem.slice(0, -suffix.length)
      break
    }
  }
  return stem
}

/**
 * 两个字符串之间的 Levenshtein 距离。
 * 用于输入来自 ASR 时的模糊匹配。
 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }

  return dp[m][n]
}
