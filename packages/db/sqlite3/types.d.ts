/**
 * Type declarations for SQLite3 WASM module
 */

export interface SQLite3Module {
  version: {
    libVersion: string;
  };
  oo1: {
    DB: new (filename: string, mode?: string) => SQLiteDB;
    OpfsDb?: new (filename: string) => SQLiteDB;
  };
  capi: {
    sqlite3_exec: (db: any, sql: string) => number;
  };
}

export interface SQLiteDB {
  exec(sql: string, options?: ExecOptions): any;
  prepare(sql: string): SQLiteStatement;
  close(): void;
  filename: string;
  changes(): number;
  lastInsertRowid(): number;
}

export interface SQLiteStatement {
  bind(params: any[]): SQLiteStatement;
  step(): boolean;
  get(asArray?: boolean): any;
  getAsObject(): Record<string, any>;
  finalize(): void;
}

export interface ExecOptions {
  returnValue?: "resultRows" | "saveSql";
  rowMode?: "array" | "object";
  callback?: (row: any) => void;
}

export interface InitOptions {
  print?: (...args: any[]) => void;
  printErr?: (...args: any[]) => void;
}

declare function sqlite3InitModule(options?: InitOptions): Promise<SQLite3Module>;

export default sqlite3InitModule;
