-- Incidents table schema for KB Labs
-- Stores incident history with enriched context data and AI analysis

-- Main incidents table
CREATE TABLE IF NOT EXISTS incidents (
  -- Identity
  id TEXT PRIMARY KEY,

  -- Classification
  type TEXT NOT NULL CHECK(type IN ('error_rate', 'latency_spike', 'plugin_failure', 'adapter_failure', 'system_health', 'custom')),
  severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'info')),

  -- Core information
  title TEXT NOT NULL,
  details TEXT NOT NULL,

  -- Timestamps
  timestamp INTEGER NOT NULL, -- Unix milliseconds when incident occurred
  resolved_at INTEGER, -- Unix milliseconds when resolved (NULL if active)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),

  -- Resolution
  resolution_notes TEXT,

  -- Affected entities (JSON arrays)
  affected_services TEXT, -- JSON: ["service1", "service2"]

  -- Original metadata from detector (JSON object)
  metadata TEXT, -- JSON: { errorRate: 5.2, threshold: 10, ... }

  -- NEW: Related data gathered during incident detection
  related_logs_count INTEGER DEFAULT 0,
  related_logs_sample TEXT, -- JSON: ["error msg 1", "error msg 2", ...]
  related_metrics TEXT, -- JSON: { errorRateBefore: 2.1, errorRateDuring: 8.5, ... }
  timeline TEXT, -- JSON: [{ timestamp, event, source }, ...]

  -- NEW: AI analysis results (stored after analysis)
  ai_analysis TEXT, -- JSON: { summary, patterns, rootCauses, recommendations }
  ai_analyzed_at INTEGER -- Unix milliseconds when AI analysis was run
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_resolved ON incidents(resolved_at);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);

-- Composite index for active incidents by severity
CREATE INDEX IF NOT EXISTS idx_incidents_active_severity
  ON incidents(severity, timestamp DESC)
  WHERE resolved_at IS NULL;

-- Full-text search on title and details (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS incidents_fts USING fts5(
  title,
  details,
  content=incidents,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync with incidents table
CREATE TRIGGER IF NOT EXISTS incidents_fts_insert AFTER INSERT ON incidents BEGIN
  INSERT INTO incidents_fts(rowid, title, details)
  VALUES (new.rowid, new.title, new.details);
END;

CREATE TRIGGER IF NOT EXISTS incidents_fts_delete AFTER DELETE ON incidents BEGIN
  DELETE FROM incidents_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS incidents_fts_update AFTER UPDATE ON incidents BEGIN
  UPDATE incidents_fts
  SET title = new.title, details = new.details
  WHERE rowid = new.rowid;
END;
