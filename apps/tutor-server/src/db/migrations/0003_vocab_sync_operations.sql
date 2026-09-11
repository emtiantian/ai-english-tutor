CREATE TABLE IF NOT EXISTS vocab_sync_operations (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_vocab_sync_operations_user
  ON vocab_sync_operations(user_id);
