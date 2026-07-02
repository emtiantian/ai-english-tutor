import type { FastifyInstance, FastifyRequest } from 'fastify'
import { LRUCache } from 'lru-cache'
import type { WordExplanation } from '@ai-english-tutor/shared'
import {
  getVocabularyByLevel,
  getVocabularyByLevelNum,
  getVocabularyUpToLevel,
  lookupWord,
  getWordsByTopic,
  getTopicsForLevel,
  getLevelsInfo,
  getRandomWords,
} from '../vocab/loader.js'
import { vocabRepo } from '../db/repositories/vocabulary.js'
import { tutorEngine } from '../ai/engine.js'

/**
 * In-memory LRU cache for word explanations.
 *
 * Key is normalized lower-case word only (ignoring sentence context) to keep
 * the cache compact; callers lose context-specific ranking on hits, which is an
 * acceptable trade-off for a quick lookup popup.
 */
const explainCache = new LRUCache<string, WordExplanation>({ max: 500 })

/**
 * Vocabulary API routes
 *
 * GET  /api/vocab/levels              - List all CEFR levels
 * GET  /api/vocab/:level              - Get words for a level (A1-C2)
 * GET  /api/vocab/level/:num          - Get words by level number (1-6)
 * GET  /api/vocab/:level/topics       - Get topics for a level
 * GET  /api/vocab/:level/topic/:topic - Get words by topic
 * GET  /api/vocab/lookup/:word        - Look up a word
 * GET  /api/vocab/random/:level       - Get random words for practice
 * GET  /api/vocab/progress/:userId    - Get user's vocabulary progress
 * POST /api/vocab/track               - Track a word (mark as learning/mastered)
 * POST /api/vocab/explain             - Explain a word for the detail popup
 */
export async function vocabRoutes(server: FastifyInstance): Promise<void> {
  // List all levels
  server.get('/api/vocab/levels', async (_request, reply) => {
    return reply.send(getLevelsInfo())
  })

  // Get words by CEFR level name (A1, A2, B1, B2, C1, C2)
  server.get('/api/vocab/:level', async (request: FastifyRequest<{ Params: { level: string } }>, reply) => {
    const { level } = request.params
    const vocab = getVocabularyByLevel(level.toUpperCase())
    return reply.send({
      level: vocab.level,
      levelNum: vocab.levelNum,
      description: vocab.description,
      wordCount: vocab.wordCount,
      words: vocab.words,
    })
  })

  // Get words by level number (1-6)
  server.get('/api/vocab/level/:num', async (request: FastifyRequest<{ Params: { num: string } }>, reply) => {
    const num = parseInt(request.params.num, 10)
    if (isNaN(num) || num < 1 || num > 6) {
      return reply.status(400).send({ error: 'Level must be 1-6', code: 'INVALID_LEVEL' })
    }
    const vocab = getVocabularyByLevelNum(num)
    return reply.send({
      level: vocab.level,
      levelNum: vocab.levelNum,
      description: vocab.description,
      wordCount: vocab.wordCount,
      words: vocab.words,
    })
  })

  // Get cumulative vocabulary up to a level
  server.get('/api/vocab/up-to/:num', async (request: FastifyRequest<{ Params: { num: string } }>, reply) => {
    const num = parseInt(request.params.num, 10)
    if (isNaN(num) || num < 1 || num > 6) {
      return reply.status(400).send({ error: 'Level must be 1-6', code: 'INVALID_LEVEL' })
    }
    const words = getVocabularyUpToLevel(num)
    return reply.send({
      upToLevel: num,
      totalWords: words.length,
      words,
    })
  })

  // Get topics for a level
  server.get('/api/vocab/:level/topics', async (request: FastifyRequest<{ Params: { level: string } }>, reply) => {
    const levelNum = levelToNum(request.params.level)
    if (!levelNum) {
      return reply.status(400).send({ error: 'Invalid level', code: 'INVALID_LEVEL' })
    }
    return reply.send({ topics: getTopicsForLevel(levelNum) })
  })

  // Get words by topic
  server.get('/api/vocab/:level/topic/:topic', async (request: FastifyRequest<{ Params: { level: string; topic: string } }>, reply) => {
    const levelNum = levelToNum(request.params.level)
    if (!levelNum) {
      return reply.status(400).send({ error: 'Invalid level', code: 'INVALID_LEVEL' })
    }
    const words = getWordsByTopic(levelNum, request.params.topic)
    return reply.send({ topic: request.params.topic, wordCount: words.length, words })
  })

  // Look up a word
  server.get('/api/vocab/lookup/:word', async (request: FastifyRequest<{ Params: { word: string } }>, reply) => {
    const result = lookupWord(request.params.word)
    if (!result) {
      return reply.status(404).send({ error: 'Word not found', code: 'WORD_NOT_FOUND' })
    }
    return reply.send(result)
  })

  // Get random words for practice
  server.get('/api/vocab/random/:level', async (request: FastifyRequest<{ Params: { level: string }; Querystring: { count?: string } }>, reply) => {
    const levelNum = levelToNum(request.params.level)
    if (!levelNum) {
      return reply.status(400).send({ error: 'Invalid level', code: 'INVALID_LEVEL' })
    }
    const count = parseInt(request.query.count ?? '5', 10)
    const words = getRandomWords(levelNum, count)
    return reply.send({ level: request.params.level, count: words.length, words })
  })

  // Get user's vocabulary progress
  server.get('/api/vocab/progress/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const progress = vocabRepo.getProgress(request.params.userId)
    return reply.send(progress)
  })

  // Track a word
  server.post('/api/vocab/track', async (request: FastifyRequest<{
    Body: { userId: string; word: string; level: string; status?: 'learning' | 'mastered' | 'forgotten' }
  }>, reply) => {
    const { userId, word, level, status = 'learning' } = request.body
    if (!userId || !word || !level) {
      return reply.status(400).send({ error: 'userId, word, and level are required', code: 'MISSING_FIELDS' })
    }
    vocabRepo.recordWord(userId, word, level, status)
    return reply.send({ success: true, word, status })
  })

  // Batch sync vocabulary actions from the client
  server.post('/api/vocab/sync', async (request: FastifyRequest<{
    Body: { userId: string; words: Array<{ word: string; action: 'learn' | 'review'; timestamp?: number }> }
  }>, reply) => {
    const { userId, words } = request.body
    if (!userId || !Array.isArray(words) || words.length === 0) {
      return reply.status(400).send({ error: 'userId and a non-empty words array are required', code: 'MISSING_FIELDS' })
    }

    let synced = 0
    for (const item of words) {
      const word = item.word?.toLowerCase().trim()
      if (!word || !item.action) continue

      if (item.action === 'learn') {
        const lookup = lookupWord(word)
        const level = lookup?.level ?? 'B1'
        vocabRepo.recordWord(userId, word, level, 'learning')
        synced++
      } else if (item.action === 'review') {
        vocabRepo.reviewWord(userId, word, true)
        synced++
      }
    }

    return reply.send({ success: true, synced })
  })

  // Review a word
  server.post('/api/vocab/review', async (request: FastifyRequest<{
    Body: { userId: string; word: string; correct: boolean }
  }>, reply) => {
    const { userId, word, correct } = request.body
    if (!userId || !word || correct === undefined) {
      return reply.status(400).send({ error: 'userId, word, and correct are required', code: 'MISSING_FIELDS' })
    }
    vocabRepo.reviewWord(userId, word, correct)
    return reply.send({ success: true, word, correct })
  })

  // Get words due for review
  server.get('/api/vocab/review/due/:userId', async (request: FastifyRequest<{
    Params: { userId: string }
    Querystring: { limit?: string }
  }>, reply) => {
    const limit = parseInt(request.query.limit ?? '10', 10)
    const words = vocabRepo.getDueForReview(request.params.userId, limit)
    return reply.send({ dueCount: words.length, words })
  })

  // Explain a word for the detail popup
  server.post('/api/vocab/explain', async (request: FastifyRequest<{
    Body: { word: string; sentence?: string }
  }>, reply) => {
    const { word, sentence } = request.body
    if (!word) {
      return reply.status(400).send({ error: 'word is required', code: 'MISSING_FIELDS' })
    }
    const key = word.toLowerCase().trim()
    const cached = explainCache.get(key)
    if (cached) return reply.send(cached)

    const explanation = await tutorEngine.explainWord(word, sentence)
    if (!explanation) {
      return reply.status(404).send({ error: 'Word not found', code: 'WORD_NOT_FOUND' })
    }
    explainCache.set(key, explanation)
    return reply.send(explanation)
  })
}

function levelToNum(level: string): number | undefined {
  const map: Record<string, number> = {
    a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6,
  }
  return map[level.toLowerCase()]
}
