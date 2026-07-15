CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  level INTEGER DEFAULT 1,
  total_study_time INTEGER DEFAULT 0,
  total_words_learned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  level INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  vocabulary_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

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
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, word)
);

CREATE TABLE IF NOT EXISTS conversation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  motion_id TEXT,
  expression_id TEXT,
  vocabulary TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_uv_user ON user_vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_uv_word ON user_vocabulary(word);
CREATE INDEX IF NOT EXISTS idx_uv_status ON user_vocabulary(status);
CREATE INDEX IF NOT EXISTS idx_uv_next_review ON user_vocabulary(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_ch_session ON conversation_history(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
