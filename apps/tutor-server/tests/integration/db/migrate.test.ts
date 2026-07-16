import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'

describe('database migrations', () => {
  const env = createTestEnv('migrate')

  beforeAll(() => {
    env.setup()
  })

  afterAll(() => {
    env.cleanup()
  })

  it('creates expected tables and applies migrations', async () => {
    const { initSchema, getDb } = await import('@/db/index.js')
    initSchema()
    const db = getDb()

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all() as string[]

    expect(tables).toContain('__migrations')
    expect(tables).toContain('users')
    expect(tables).toContain('sessions')
    expect(tables).toContain('user_vocabulary')
    expect(tables).toContain('conversation_history')

    const migrations = db.prepare('SELECT version FROM __migrations ORDER BY version').pluck().all() as number[]
    expect(migrations).toEqual([1, 2])
  })
})
