import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-vocab-sync-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

const { initSchema, closeDb } = await import('../db/index.js')
const { vocabRoutes } = await import('./vocab.js')
const { vocabRepo } = await import('../db/repositories/vocabulary.js')
const Fastify = (await import('fastify')).default

async function main(): Promise<void> {
  initSchema()

  const app = Fastify()
  await app.register(vocabRoutes)

  const userId = 'test-user-001'
  const response = await app.inject({
    method: 'POST',
    url: '/api/vocab/sync',
    payload: {
      userId,
      words: [
        { word: 'coffee', action: 'learn', timestamp: Date.now() },
        { word: 'tea', action: 'learn', timestamp: Date.now() },
      ],
    },
  })

  assert.strictEqual(response.statusCode, 200, `expected 200, got ${response.statusCode}: ${response.body}`)
  const body = JSON.parse(response.body)
  assert.strictEqual(body.success, true)
  assert.strictEqual(body.synced, 2)

  const words = vocabRepo.getAllWords(userId).map((r) => r.word)
  assert(words.includes('coffee'), 'coffee should be recorded')
  assert(words.includes('tea'), 'tea should be recorded')

  await app.close()
  console.log('✅ vocab sync endpoint test passed')
}

main()
  .catch((err) => {
    console.error('❌ vocab sync endpoint test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    closeDb()
    rmSync(tmpDir, { recursive: true, force: true })
  })
