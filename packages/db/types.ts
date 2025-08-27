/**
 * Database interface and types
 */

export interface Database {
  initialize(): Promise<void>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
  transaction<T>(callback: (db: Database) => Promise<T>): Promise<T>;
  search(query: string, limit?: number, offset?: number): Promise<SearchResult[]>;
  close(): Promise<void>;
  getStats(): Promise<DatabaseStats>;
}

export interface SearchResult {
  id: number;
  url: string;
  title: string | null;
  site: string | null;
  saved_at: string;
  word_count: number | null;
  title_snippet: string;
  content_snippet: string;
  relevance_score: number;
}

export interface DatabaseStats {
  documentCount: number;
  summaryCount: number;
  databaseSize: number;
}

export interface Document {
  id?: number;
  url: string;
  title?: string;
  site?: string;
  saved_at?: string;
  word_count?: number;
  hash?: string;
  raw_text: string;
}

export interface Summary {
  id?: number;
  document_id: number;
  model: string;
  params_json: string;
  saved_path?: string;
  saved_format?: "md" | "txt";
  created_at?: string;
}

export interface ABRun {
  id?: number;
  document_id: number;
  model_a: string;
  model_b: string;
  prompt_template: string;
  created_at?: string;
}

export interface ABScore {
  id?: number;
  run_id: number;
  coverage: number;
  readability: number;
  faithfulness: number;
  note?: string;
  rater?: string;
  created_at?: string;
}
