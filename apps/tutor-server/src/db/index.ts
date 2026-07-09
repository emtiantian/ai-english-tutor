import Database from 'better-sqlite3'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

/**
 * 使用 SQLite（better-sqlite3）的数据库连接
 *
 * 表：
 *   - users: 用户资料
 *   - sessions: 学习会话
 *   - user_vocabulary: 单词掌握追踪
 *   - conversation_history: 聊天历史
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
 * 所有 DDL 包装在单个事务中，以避免部分状态，并减少多个进程并发启动时的竞态。
 */
export function initSchema(): void {
  const database = getDb()

  const init = database.transaction(() => {
    // 用户表
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        level INTEGER DEFAULT 1,
        total_study_time INTEGER DEFAULT 0,
        total_words_learned INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `)

    // 会话表
    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        level INTEGER DEFAULT 1,
        style_name TEXT,
        voice_design TEXT,
        scenario_state TEXT,
        status TEXT DEFAULT 'active',
        vocabulary_count INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)

    // 用户词汇追踪
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        word TEXT NOT NULL,
        level TEXT NOT NULL,
        status TEXT DEFAULT 'learning',
        review_count INTEGER DEFAULT 0,
        correct_count INTEGER DEFAULT 0,
        incorrect_count INTEGER DEFAULT 0,
        last_review_at INTEGER,
        next_review_at INTEGER,
        context_count INTEGER DEFAULT 0,
        contexts TEXT DEFAULT '[]',
        consecutive_incorrect INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT (unixepoch()),
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(user_id, word)
      )
    `)

    // 对话历史
    database.exec(`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        motion_id TEXT,
        expression_id TEXT,
        vocabulary TEXT,
        vocabulary_sentences TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)

    // 向后兼容迁移：添加旧数据库可能缺失的列。
    // 错误被忽略，因为 SQLite 在列已存在时会抛出异常。
    const migrations = [
      `ALTER TABLE sessions ADD COLUMN style_name TEXT`,
      `ALTER TABLE sessions ADD COLUMN voice_design TEXT`,
      `ALTER TABLE sessions ADD COLUMN scenario_state TEXT`,
      `ALTER TABLE user_vocabulary ADD COLUMN context_count INTEGER DEFAULT 0`,
      `ALTER TABLE user_vocabulary ADD COLUMN contexts TEXT DEFAULT '[]'`,
      `ALTER TABLE user_vocabulary ADD COLUMN consecutive_incorrect INTEGER DEFAULT 0`,
      `ALTER TABLE user_vocabulary ADD COLUMN updated_at INTEGER DEFAULT (unixepoch())`,
      `ALTER TABLE conversation_history ADD COLUMN vocabulary_sentences TEXT`,
    ]

    for (const sql of migrations) {
      try {
        database.exec(sql)
      } catch {
        // 列已存在或表已是最新
      }
    }

    // 创建索引
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_user ON user_vocabulary(user_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_word ON user_vocabulary(word)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_status ON user_vocabulary(status)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_next_review ON user_vocabulary(user_id, next_review_at)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_ch_session ON conversation_history(session_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`)
  })

  init()
  logger.info('SQLite 数据库结构初始化完成')
}
