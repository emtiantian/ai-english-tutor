import Database from 'better-sqlite3'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { migrate } from './migrate.js'

/**
 * 使用 SQLite（better-sqlite3）的数据库连接。
 *
 * Schema 与迁移已迁移到 db/schema/ 与 db/migrations/，由 migrate() 统一管理。
 */

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    // 确保数据目录存在
    const dataDir = dirname(config.DB_PATH)
    try {
      mkdirSync(dataDir, { recursive: true })
    } catch {
      // 目录可能已存在
    }

    db = new Database(config.DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    logger.info({ path: config.DB_PATH }, 'SQLite 数据库已连接')
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    logger.info('SQLite 数据库已关闭')
  }
}

/**
 * 初始化数据库 schema。
 *
 * 实际 DDL 与迁移由 db/migrate.ts 按版本号顺序执行，并记录到 __migrations 表。
 */
export function initSchema(): void {
  const database = getDb()
  migrate(database)
  logger.info('SQLite 数据库结构初始化完成')
}
