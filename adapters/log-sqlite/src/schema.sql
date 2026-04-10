-- ============================================================================
-- KB Labs Log Persistence Schema (SQLite)
-- ============================================================================

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('trace', 'debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  source TEXT NOT NULL,
  fields TEXT, -- JSON serialized fields
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_timestamp ON logs(level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_source_timestamp ON logs(source, timestamp DESC);

-- Full-text search using FTS5
CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
  message,
  content=logs,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync with logs table
DROP TRIGGER IF EXISTS logs_fts_insert;
CREATE TRIGGER IF NOT EXISTS logs_fts_insert AFTER INSERT ON logs BEGIN
  INSERT INTO logs_fts(rowid, message) VALUES (new.rowid, new.message);
END;

DROP TRIGGER IF EXISTS logs_fts_delete;
CREATE TRIGGER IF NOT EXISTS logs_fts_delete AFTER DELETE ON logs BEGIN
  INSERT INTO logs_fts(logs_fts, rowid, message) VALUES('delete', old.rowid, old.message);
END;

DROP TRIGGER IF EXISTS logs_fts_update;
CREATE TRIGGER IF NOT EXISTS logs_fts_update AFTER UPDATE ON logs BEGIN
  INSERT INTO logs_fts(logs_fts, rowid, message) VALUES('delete', old.rowid, old.message);
  INSERT INTO logs_fts(rowid, message) VALUES (new.rowid, new.message);
END;
