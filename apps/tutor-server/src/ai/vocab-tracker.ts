import { logger } from '../logger.js'
import { vocabRepo, type WordStatus } from '../db/repositories/vocabulary.js'

export interface ReviewWord {
  word: string
  level: string
  status: WordStatus
  contextCount: number
}

export interface VocabAnalysis {
  /** Words from the review list that appeared in user's text */
  usedWords: string[]
  /** Words from the review list that the user struggled with */
  missedWords: string[]
  /** New vocabulary the AI introduced (from LLM response) */
  newWords: string[]
}

/**
 * Vocabulary tracker for spaced repetition in conversation.
 *
 * Tracks which words the user encounters, how many different contexts
 * they've seen them in, and schedules reviews accordingly.
 *
 * Handles:
 * - Text input: exact + stemmed matching
 * - Audio input: fuzzy matching to tolerate ASR errors
 */
export class VocabTracker {
  /**
   * Get words due for review for a user.
   */
  getReviewWords(userId: string, limit: number = 5): ReviewWord[] {
    const dueWords = vocabRepo.getDueForReview(userId, limit)
    return dueWords.map((w) => ({
      ...w,
      contextCount: 0,
    }))
  }

  /**
   * Build a prompt fragment instructing the AI to naturally use review words.
   */
  buildReviewPrompt(reviewWords: ReviewWord[]): string {
    if (reviewWords.length === 0) return ''

    const wordList = reviewWords.map((w) => `"${w.word}"`).join(', ')
    return `
VOCABULARY REVIEW — The student needs to practice these words. Naturally incorporate them into your response in a NEW context (different from previous conversations). Don't force them — weave them in organically. If the word doesn't fit naturally, skip it.

Words to review: ${wordList}

After using a review word, include it in the "vocabulary" field of your JSON response.`
  }

  /**
   * Analyze user text to check if they used any target vocabulary words.
   *
   * Matching strategy:
   * 1. Exact match (case-insensitive)
   * 2. Stemmed match — strip common English suffixes to catch variations
   * 3. For audio input: also try Levenshtein distance ≤ 2 (tolerates ASR errors)
   */
  analyzeUserText(
    userText: string,
    targetWords: string[],
    options: { isAudioInput?: boolean } = {},
  ): { used: string[]; missed: string[] } {
    const normalizedText = userText.toLowerCase()
    const tokens = normalizedText.split(/\s+/).map((t) => t.replace(/[^a-z']/g, ''))
    const used: string[] = []
    const missed: string[] = []

    for (const word of targetWords) {
      const normalizedWord = word.toLowerCase()

      // Reject words that contain characters outside the safe set to prevent
      // regex injection and ReDoS from malicious/tampered vocabulary data.
      if (!isValidWord(normalizedWord)) {
        logger.warn({ word }, 'Vocab: skipping invalid target word')
        continue
      }

      let found = false

      // 1. Exact match
      const exactRegex = new RegExp(`\\b${escapeRegex(normalizedWord)}\\b`, 'i')
      if (exactRegex.test(normalizedText)) {
        found = true
      }

      // 2. Stemmed match — check if any token shares the same stem
      if (!found) {
        const wordStem = simpleStem(normalizedWord)
        found = tokens.some((token) => simpleStem(token) === wordStem)
      }

      // 3. Audio input: fuzzy match (Levenshtein distance ≤ 2)
      if (!found && options.isAudioInput) {
        const MAX_FUZZY_LEN = 50
        const clampedWord = normalizedWord.slice(0, MAX_FUZZY_LEN)
        found = tokens.some((token) => {
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
   * Process vocabulary after a conversation turn.
   */
  processTurn(
    userId: string,
    userText: string,
    aiResponseWords: string[],
    reviewWords: ReviewWord[],
    level: string,
    options: { isAudioInput?: boolean } = {},
  ): VocabAnalysis {
    const targetWords = reviewWords.map((w) => w.word)
    const { used, missed } = this.analyzeUserText(userText, targetWords, options)

    // Mark correctly used words
    for (const word of used) {
      vocabRepo.reviewWord(userId, word, true)
      logger.info({ userId, word, isAudio: options.isAudioInput }, 'Vocab: user used review word')
    }

    // Schedule re-review for missed words
    for (const word of missed) {
      vocabRepo.reviewWord(userId, word, false)
      logger.debug({ userId, word }, 'Vocab: user missed review word, rescheduled')
    }

    // Record new words from AI response
    const newWords: string[] = []
    for (const word of aiResponseWords) {
      const existing = vocabRepo.getAllWords(userId).find((w) => w.word === word.toLowerCase())
      if (!existing) {
        vocabRepo.recordWord(userId, word, level, 'learning')
        newWords.push(word)
        logger.info({ userId, word, level }, 'Vocab: new word recorded')
      }
    }

    return { usedWords: used, missedWords: missed, newWords }
  }

  /**
   * Get vocabulary progress summary for a user.
   */
  getProgress(userId: string) {
    return vocabRepo.getProgress(userId)
  }
}

// ── Helpers ──────────────────────────────────────────────

/** Escape special regex characters */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Validate that a word only contains safe characters for regex matching. */
function isValidWord(word: string): boolean {
  return /^[a-z0-9]+([ '-][a-z0-9]+)*$/i.test(word)
}

/**
 * Simple English stemmer — strips common suffixes.
 * Not Porter/Snowball quality, but good enough for vocabulary matching.
 */
function simpleStem(word: string): string {
  // Order matters: longer suffixes first
  const suffixes = [
    'tion', 'sion', 'ment', 'ness', 'able', 'ible', 'ful', 'less',
    'ous', 'ive', 'ing', 'ied', 'ies', 'ers', 'est', 'ly', 'ed',
    'er', 'es', 's',
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
 * Levenshtein distance between two strings.
 * Used for fuzzy matching when input is from ASR.
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
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }

  return dp[m][n]
}
