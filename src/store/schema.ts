export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  workspace_path TEXT,
  created_at TEXT,
  updated_at TEXT,
  diagnostics TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT NOT NULL,
  work_id TEXT NOT NULL REFERENCES works(id),
  harness TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  started_at TEXT,
  PRIMARY KEY (work_id, id)
);

CREATE TABLE IF NOT EXISTS source_sessions (
  work_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  harness TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_format TEXT,
  source_location TEXT,
  PRIMARY KEY (work_id, execution_id),
  UNIQUE (work_id, harness, source_id),
  FOREIGN KEY (work_id, execution_id) REFERENCES executions(work_id, id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT NOT NULL,
  work_id TEXT NOT NULL REFERENCES works(id),
  execution_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  timestamp TEXT,
  payload TEXT NOT NULL,
  provenance TEXT NOT NULL,
  diagnostics TEXT NOT NULL,
  harness TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  provenance_line INTEGER,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (work_id, id),
  UNIQUE (work_id, harness, source_session_id, source_event_id),
  FOREIGN KEY (work_id, execution_id) REFERENCES executions(work_id, id)
);
`;

export const DERIVED_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  summary TEXT NOT NULL,
  evidence TEXT NOT NULL, -- json string array of event ids
  provenance TEXT NOT NULL, -- json
  rule TEXT NOT NULL,
  ordinal INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  statement TEXT NOT NULL,
  evidence TEXT NOT NULL,
  provenance TEXT NOT NULL,
  rule TEXT NOT NULL,
  ordinal INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS next_steps (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  description TEXT NOT NULL,
  evidence TEXT NOT NULL,
  provenance TEXT NOT NULL,
  rule TEXT NOT NULL,
  ordinal INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  tool_name TEXT,
  path TEXT,
  command TEXT,
  status TEXT NOT NULL,
  note TEXT,
  evidence TEXT NOT NULL,
  provenance TEXT NOT NULL,
  rule TEXT NOT NULL,
  ordinal INTEGER NOT NULL
);
`;

export const CHECKPOINTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  execution_id TEXT,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  event_ordinal_watermark INTEGER NOT NULL,
  event_count INTEGER NOT NULL,
  goal_json TEXT,
  decisions_json TEXT NOT NULL DEFAULT '[]',
  findings_json TEXT NOT NULL DEFAULT '[]',
  next_steps_json TEXT NOT NULL DEFAULT '[]',
  operations_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_work_seq ON checkpoints(work_id, rowid);
`;
