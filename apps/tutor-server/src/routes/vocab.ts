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
  getRandomWords
} from '../vocab/loader.js'
import { vocabRepo } from '../db/repositories/vocabulary.js'
import { tutorEngine } from '../ai/engine.js'

/**
 * 单词释义的内存 LRU 缓存。
 *
 * 缓存键仅归一化为小写单词（忽略句子上下文），以保持缓存紧凑；
 * 命中时会丢失上下文相关的排序，这对快速查词弹窗来说是可以接受的权衡。
 */
const explainCache = new LRUCache<string, WordExplanation>({ max: 500 })

/**
 * 词汇 API 路由
 *
 * GET  /api/vocab/levels              - 列出所有 CEFR 等级
 * GET  /api/vocab/:level              - 获取某等级的单词（A1-C2）
 * GET  /api/vocab/level/:num          - 按等级数字获取单词（1-6）
 * GET  /api/vocab/:level/topics       - 获取某等级的主题
 * GET  /api/vocab/:level/topic/:topic - 按主题获取单词
 * GET  /api/vocab/lookup/:word        - 查词
 * GET  /api/vocab/random/:level       - 获取随机单词用于练习
 * GET  /api/vocab/progress/:userId    - 获取用户词汇进度
 * POST /api/vocab/track               - 跟踪单词（标记为学习中/已掌握）
 * POST /api/vocab/explain             - 为详情弹窗解释单词
 */
export async function vocabRoutes(server: FastifyInstance): Promise<void> {
  // 列出所有等级
  server.get('/api/vocab/levels', async (_request, reply) => {
    return reply.send(getLevelsInfo())
  })

  // 按 CEFR 等级名称获取单词（A1, A2, B1, B2, C1, C2）
  server.get(
    '/api/vocab/:level',
    async (request: FastifyRequest<{ Params: { level: string } }>, reply) => {
      const { level } = request.params
      const vocab = getVocabularyByLevel(level.toUpperCase())
      return reply.send({
        level: vocab.level,
        levelNum: vocab.levelNum,
        description: vocab.description,
        wordCount: vocab.wordCount,
        words: vocab.words
      })
    }
  )

  // 按等级数字获取单词（1-6）
  server.get(
    '/api/vocab/level/:num',
    async (request: FastifyRequest<{ Params: { num: string } }>, reply) => {
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
        words: vocab.words
      })
    }
  )

  // 获取到某等级为止的累计词汇
  server.get(
    '/api/vocab/up-to/:num',
    async (request: FastifyRequest<{ Params: { num: string } }>, reply) => {
      const num = parseInt(request.params.num, 10)
      if (isNaN(num) || num < 1 || num > 6) {
        return reply.status(400).send({ error: 'Level must be 1-6', code: 'INVALID_LEVEL' })
      }
      const words = getVocabularyUpToLevel(num)
      return reply.send({
        upToLevel: num,
        totalWords: words.length,
        words
      })
    }
  )

  // 获取某等级的主题
  server.get(
    '/api/vocab/:level/topics',
    async (request: FastifyRequest<{ Params: { level: string } }>, reply) => {
      const levelNum = levelToNum(request.params.level)
      if (!levelNum) {
        return reply.status(400).send({ error: 'Invalid level', code: 'INVALID_LEVEL' })
      }
      return reply.send({ topics: getTopicsForLevel(levelNum) })
    }
  )

  // 按主题获取单词
  server.get(
    '/api/vocab/:level/topic/:topic',
    async (request: FastifyRequest<{ Params: { level: string; topic: string } }>, reply) => {
      const levelNum = levelToNum(request.params.level)
      if (!levelNum) {
        return reply.status(400).send({ error: 'Invalid level', code: 'INVALID_LEVEL' })
      }
      const words = getWordsByTopic(levelNum, request.params.topic)
      return reply.send({ topic: request.params.topic, wordCount: words.length, words })
    }
  )

  // 查词
  server.get(
    '/api/vocab/lookup/:word',
    async (request: FastifyRequest<{ Params: { word: string } }>, reply) => {
      const result = lookupWord(request.params.word)
      if (!result) {
        return reply.status(404).send({ error: 'Word not found', code: 'WORD_NOT_FOUND' })
      }
      return reply.send(result)
    }
  )

  // 获取随机单词用于练习
  server.get(
    '/api/vocab/random/:level',
    async (
      request: FastifyRequest<{ Params: { level: string }; Querystring: { count?: string } }>,
      reply
    ) => {
      const levelNum = levelToNum(request.params.level)
      if (!levelNum) {
        return reply.status(400).send({ error: 'Invalid level', code: 'INVALID_LEVEL' })
      }
      const count = parseInt(request.query.count ?? '5', 10)
      const words = getRandomWords(levelNum, count)
      return reply.send({ level: request.params.level, count: words.length, words })
    }
  )

  // 获取用户词汇进度
  server.get(
    '/api/vocab/progress/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
      const progress = vocabRepo.getProgress(request.params.userId)
      return reply.send(progress)
    }
  )

  // 跟踪单词
  server.post(
    '/api/vocab/track',
    async (
      request: FastifyRequest<{
        Body: {
          userId: string
          word: string
          level: string
          status?: 'learning' | 'mastered' | 'forgotten'
        }
      }>,
      reply
    ) => {
      const { userId, word, level, status = 'learning' } = request.body
      if (!userId || !word || !level) {
        return reply
          .status(400)
          .send({ error: 'userId, word, and level are required', code: 'MISSING_FIELDS' })
      }
      vocabRepo.recordWord(userId, word, level, status)
      return reply.send({ success: true, word, status })
    }
  )

  // 批量同步客户端的词汇操作
  server.post(
    '/api/vocab/sync',
    async (
      request: FastifyRequest<{
        Body: {
          userId: string
          words: Array<{ word: string; action: 'learn' | 'review'; timestamp?: number }>
        }
      }>,
      reply
    ) => {
      const { userId, words } = request.body
      if (!userId || !Array.isArray(words) || words.length === 0) {
        return reply.status(400).send({
          error: 'userId and a non-empty words array are required',
          code: 'MISSING_FIELDS'
        })
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
    }
  )

  // 复习单词
  server.post(
    '/api/vocab/review',
    async (
      request: FastifyRequest<{
        Body: { userId: string; word: string; correct: boolean }
      }>,
      reply
    ) => {
      const { userId, word, correct } = request.body
      if (!userId || !word || correct === undefined) {
        return reply
          .status(400)
          .send({ error: 'userId, word, and correct are required', code: 'MISSING_FIELDS' })
      }
      vocabRepo.reviewWord(userId, word, correct)
      return reply.send({ success: true, word, correct })
    }
  )

  // 获取到期复习的单词
  server.get(
    '/api/vocab/review/due/:userId',
    async (
      request: FastifyRequest<{
        Params: { userId: string }
        Querystring: { limit?: string }
      }>,
      reply
    ) => {
      const limit = parseInt(request.query.limit ?? '10', 10)
      const words = vocabRepo.getDueForReview(request.params.userId, limit)
      return reply.send({ dueCount: words.length, words })
    }
  )

  // 为详情弹窗解释单词
  server.post(
    '/api/vocab/explain',
    async (
      request: FastifyRequest<{
        Body: { word: string; sentence?: string }
      }>,
      reply
    ) => {
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
    }
  )
}

function levelToNum(level: string): number | undefined {
  const map: Record<string, number> = {
    a1: 1,
    a2: 2,
    b1: 3,
    b2: 4,
    c1: 5,
    c2: 6
  }
  return map[level.toLowerCase()]
}
