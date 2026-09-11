import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestEnv } from '@tests/helpers/env.js'
import Database from 'better-sqlite3'

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
    expect(tables).toContain('vocab_sync_operations')

    const migrations = db
      .prepare('SELECT version FROM __migrations ORDER BY version')
      .pluck()
      .all() as number[]
    expect(migrations).toEqual([1, 2, 3])
  })

  it('applies new migrations to a legacy database without migration metadata', async () => {
    const { migrate } = await import('@/db/migrate.js')
    const legacyDb = new Database(':memory:')
    legacyDb.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE sessions (id TEXT PRIMARY KEY);
      CREATE TABLE user_vocabulary (id INTEGER PRIMARY KEY);
      CREATE TABLE conversation_history (id INTEGER PRIMARY KEY);
    `)
    migrate(legacyDb)
    const table = legacyDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vocab_sync_operations'"
      )
      .get()

    expect(table).toBeDefined()
    legacyDb.close()
  })
})
