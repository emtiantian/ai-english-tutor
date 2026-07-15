import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'tutor-migrate-test-'))
process.env.DB_PATH = join(tmpDir, 'test.db')

const { initSchema, closeDb, getDb } = await import('./index.js')

async function main(): Promise<void> {
  initSchema()
  const db = getDb()

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).pluck().all() as string[]

  assert(tables.includes('__migrations'), '__migrations 表应该存在')
  assert(tables.includes('users'), 'users 表应该存在')
  assert(tables.includes('sessions'), 'sessions 表应该存在')
  assert(tables.includes('user_vocabulary'), 'user_vocabulary 表应该存在')
  assert(tables.includes('conversation_history'), 'conversation_history 表应该存在')

  const migrations = db.prepare('SELECT version FROM __migrations ORDER BY version').pluck().all() as number[]
  assert.deepStrictEqual(migrations, [1, 2], '所有迁移都应已应用')

  console.log('✅ migrate test passed')
}

main()
  .catch((err) => {
    console.error('❌ migrate test failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    closeDb()
    rmSync(tmpDir, { recursive: true, force: true })
  })
