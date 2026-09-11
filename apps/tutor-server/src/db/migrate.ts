import Database from 'better-sqlite3'
import { logger } from '../logger.js'
import { allMigrations } from './migrations/index.js'

/**
 * 轻量级迁移 runner。
 *
 * - 使用 `__migrations` 表记录已应用的版本。
 * - 对已有业务表但无 `__migrations` 的旧数据库，bootstrap 时一次性标记所有当前迁移为已应用。
 * - 新增迁移按版本号顺序执行，每个迁移在独立事务中完成。
 */

const MIGRATION_TABLE = '__migrations'
// 引入迁移元数据之前，线上旧库的结构已经等价于 0001 + 0002。
// 只将这两版登记为历史基线；之后新增的迁移仍必须真实执行。
const LEGACY_BASELINE_VERSION = 2

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER DEFAULT (unixepoch())
    )
  `)

  const appliedVersions = new Set(
    db.prepare(`SELECT version FROM ${MIGRATION_TABLE}`).pluck().all() as number[]
  )

  // 旧数据库兼容：若元数据表为空但业务表已存在，登记引入迁移系统前的历史基线。
  if (appliedVersions.size === 0 && hasLegacyTables(db)) {
    bootstrapLegacyDb(db)
    for (const migration of allMigrations.filter(m => m.version <= LEGACY_BASELINE_VERSION)) {
      appliedVersions.add(migration.version)
    }
  }

  for (const migration of allMigrations) {
    if (appliedVersions.has(migration.version)) continue

    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare(`INSERT INTO ${MIGRATION_TABLE} (version) VALUES (?)`).run(migration.version)
    })()

    logger.info({ version: migration.version, name: migration.name }, '数据库迁移已应用')
  }
}

function hasLegacyTables(db: Database.Database): boolean {
  const legacyTables = ['users', 'sessions', 'user_vocabulary', 'conversation_history']
  const check = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
  return legacyTables.some(table => check.get(table) !== undefined)
}

function bootstrapLegacyDb(db: Database.Database): void {
  const insert = db.prepare(`INSERT OR IGNORE INTO ${MIGRATION_TABLE} (version) VALUES (?)`)
  for (const migration of allMigrations.filter(m => m.version <= LEGACY_BASELINE_VERSION)) {
    insert.run(migration.version)
  }
  logger.info({ baseline: LEGACY_BASELINE_VERSION }, '检测到旧数据库，已登记历史迁移基线')
}
