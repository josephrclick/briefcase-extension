
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  site TEXT,
  saved_at TEXT NOT NULL,
  word_count INTEGER,
  hash TEXT UNIQUE,
  raw_text TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
  content, title, url, content=''
);

CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  params_json TEXT NOT NULL,
  saved_path TEXT,
  saved_format TEXT CHECK(saved_format IN ('md','txt')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ab_runs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  model_a TEXT NOT NULL,
  model_b TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ab_scores (
  run_id TEXT NOT NULL REFERENCES ab_runs(id) ON DELETE CASCADE,
  coverage INTEGER NOT NULL,
  readability INTEGER NOT NULL,
  faithfulness INTEGER NOT NULL,
  note TEXT,
  rater TEXT DEFAULT 'me',
  created_at TEXT NOT NULL
);
