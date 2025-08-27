-- SQLite Database Schema with INTEGER PRIMARY KEY and FTS5 External Content
-- Version: 2.0.0

-- Enable WAL mode for better concurrency
PRAGMA journal_mode=WAL;
-- Enforce foreign key constraints
PRAGMA foreign_keys=ON;

-- Main documents table with INTEGER PRIMARY KEY for better performance
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT,
  site TEXT,
  saved_at TEXT NOT NULL DEFAULT (datetime('now')),
  word_count INTEGER,
  hash TEXT UNIQUE,
  raw_text TEXT NOT NULL
);

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_documents_url ON documents(url);
CREATE INDEX IF NOT EXISTS idx_documents_saved_at ON documents(saved_at);
CREATE INDEX IF NOT EXISTS idx_documents_site ON documents(site);

-- FTS5 table with external content to avoid duplication
CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
  title,
  content,
  url,
  content=documents,
  content_rowid=id
);

-- Triggers to keep FTS index in sync with documents table
-- Insert trigger
CREATE TRIGGER IF NOT EXISTS documents_after_insert 
AFTER INSERT ON documents 
BEGIN
  INSERT INTO doc_fts(rowid, title, content, url) 
  VALUES (new.id, new.title, new.raw_text, new.url);
END;

-- Update trigger
CREATE TRIGGER IF NOT EXISTS documents_after_update 
AFTER UPDATE ON documents 
BEGIN
  UPDATE doc_fts 
  SET title = new.title, content = new.raw_text, url = new.url 
  WHERE rowid = new.id;
END;

-- Delete trigger
CREATE TRIGGER IF NOT EXISTS documents_before_delete 
BEFORE DELETE ON documents 
BEGIN
  DELETE FROM doc_fts WHERE rowid = old.id;
END;

-- Summaries table with INTEGER foreign key
CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  params_json TEXT NOT NULL,
  saved_path TEXT,
  saved_format TEXT CHECK(saved_format IN ('md','txt')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summaries_document_id ON summaries(document_id);
CREATE INDEX IF NOT EXISTS idx_summaries_model ON summaries(model);

-- A/B comparison runs table
CREATE TABLE IF NOT EXISTS ab_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  model_a TEXT NOT NULL,
  model_b TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ab_runs_document_id ON ab_runs(document_id);

-- A/B comparison scores table
CREATE TABLE IF NOT EXISTS ab_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  coverage INTEGER NOT NULL CHECK(coverage >= 0 AND coverage <= 100),
  readability INTEGER NOT NULL CHECK(readability >= 0 AND readability <= 100),
  faithfulness INTEGER NOT NULL CHECK(faithfulness >= 0 AND faithfulness <= 100),
  note TEXT,
  rater TEXT DEFAULT 'me',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES ab_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ab_scores_run_id ON ab_scores(run_id);

-- View for convenient document search results
CREATE VIEW IF NOT EXISTS document_search_view AS
SELECT 
  d.id,
  d.url,
  d.title,
  d.site,
  d.saved_at,
  d.word_count,
  snippet(doc_fts, 0, '<mark>', '</mark>', '...', 30) AS title_snippet,
  snippet(doc_fts, 1, '<mark>', '</mark>', '...', 30) AS content_snippet,
  bm25(doc_fts) AS relevance_score
FROM doc_fts
JOIN documents d ON d.id = doc_fts.rowid;