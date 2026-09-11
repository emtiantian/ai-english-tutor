import type { FastifyInstance, FastifyRequest } from 'fastify'
import { LRUCache } from 'lru-cache'
import type { WordExplanation } from '@ai-english-tutor/shared'
import { tutorEngine } from '../ai/engine.js'
import { lookupWord } from '../vocab/loader.js'

const explainCache = new LRUCache<string, WordExplanation>({ max: 500 })

/** Basic word lookup used by the dialogue vocabulary popover. */
export async function vocabRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/api/vocab/lookup/:word',
    async (request: FastifyRequest<{ Params: { word: string } }>, reply) => {
      const result = lookupWord(request.params.word)
      if (!result)
        return reply.status(404).send({ error: 'Word not found', code: 'WORD_NOT_FOUND' })
      return reply.send(result)
    }
  )

  server.post(
    '/api/vocab/explain',
    async (request: FastifyRequest<{ Body: { word: string; sentence?: string } }>, reply) => {
      const word = request.body?.word?.trim()
      if (!word)
        return reply.status(400).send({ error: 'word is required', code: 'MISSING_FIELDS' })
      const key = word.toLowerCase()
      const cached = explainCache.get(key)
      if (cached) return reply.send(cached)
      const explanation = await tutorEngine.explainWord(word, request.body.sentence)
      if (!explanation) {
        return reply.status(404).send({ error: 'Word not found', code: 'WORD_NOT_FOUND' })
      }
      explainCache.set(key, explanation)
      return reply.send(explanation)
    }
  )
}
