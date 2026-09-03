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
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  harness TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  started_at TEXT
);

CREATE TABLE IF NOT EXISTS source_sessions (
  execution_id TEXT PRIMARY KEY REFERENCES executions(id),
  harness TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_format TEXT,
  source_location TEXT,
  UNIQUE (harness, source_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES works(id),
  execution_id TEXT NOT NULL REFERENCES executions(id),
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
  UNIQUE (harness, source_session_id, source_event_id)
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
