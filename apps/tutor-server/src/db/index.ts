import Database from 'better-sqlite3'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

/**
 * Database connection using SQLite (better-sqlite3)
 *
 * Tables:
 *   - users: User profiles
 *   - sessions: Learning sessions
 *   - user_vocabulary: Word mastery tracking
 *   - conversation_history: Chat history
 */

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const dataDir = dirname(config.DB_PATH)
    try {
      mkdirSync(dataDir, { recursive: true })
    } catch {
      // Directory may already exist
    }

    db = new Database(config.DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    logger.info({ path: config.DB_PATH }, 'SQLite database connected')
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    logger.info('SQLite database closed')
  }
}

/**
 * Initialize database schema.
 *
 * All DDL is wrapped in a single transaction to avoid partial state and
 * reduce races when multiple processes start concurrently.
 */
export function initSchema(): void {
  const database = getDb()

  const init = database.transaction(() => {
    // Users table
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

    // Sessions table
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

    // User vocabulary tracking
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

    // Conversation history
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

    // Backwards-compatible migrations: add columns that may be missing in older DBs.
    // Errors are ignored because SQLite throws when the column already exists.
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
        // Column already exists or table is already up to date
      }
    }

    // Create indexes
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_user ON user_vocabulary(user_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_word ON user_vocabulary(word)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_status ON user_vocabulary(status)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_uv_next_review ON user_vocabulary(user_id, next_review_at)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_ch_session ON conversation_history(session_id)`)
    database.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`)
  })

  init()
  logger.info('SQLite schema initialized')
}
