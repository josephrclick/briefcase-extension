/**
 * Unit tests for ConnectionManager with single-connection queue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConnectionManager } from "../../offscreen/connectionManager";

// Mock the SQLite wrapper
vi.mock("@briefcase/db/sqlite", () => ({
  SQLiteWrapper: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ changes: 0, lastInsertRowid: 1 }),
    transaction: vi.fn().mockImplementation((callback) =>
      callback({
        execute: vi.fn().mockResolvedValue({ changes: 0, lastInsertRowid: 1 }),
      }),
    ),
    search: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({
      documentCount: 0,
      summaryCount: 0,
      databaseSize: 0,
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("ConnectionManager", () => {
  let connectionManager: ConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    connectionManager = new ConnectionManager();
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.close();
    }
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize successfully", async () => {
      await connectionManager.initialize();

      // Second initialization should be idempotent
      await connectionManager.initialize();

      expect(true).toBe(true);
    });

    it("should handle concurrent initialization calls", async () => {
      const promises = Array(5)
        .fill(null)
        .map(() => connectionManager.initialize());
      await Promise.all(promises);

      expect(true).toBe(true);
    });

    it("should initialize with custom config", async () => {
      const customManager = new ConnectionManager({
        retryAttempts: 5,
        retryDelay: 2000,
        queryTimeout: 60000,
        useOPFS: false,
      });

      await customManager.initialize();
      await customManager.close();

      expect(true).toBe(true);
    });
  });

  describe("Query Operations", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should execute queries", async () => {
      const result = await connectionManager.query("SELECT * FROM documents");
      expect(Array.isArray(result)).toBe(true);
    });

    it("should execute parameterized queries", async () => {
      const result = await connectionManager.query("SELECT * FROM documents WHERE id = ?", [1]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle query errors with retry", async () => {
      const customManager = new ConnectionManager({
        retryAttempts: 2,
        retryDelay: 100,
        queryTimeout: 1000,
        useOPFS: false,
      });

      await customManager.initialize();

      // Mock a failing query that succeeds on retry
      const mockQuery = vi
        .fn()
        .mockRejectedValueOnce(new Error("Temporary error"))
        .mockResolvedValueOnce([{ id: 1 }]);

      // @ts-ignore - accessing private property for testing
      customManager.db.query = mockQuery;

      const result = await customManager.query("SELECT * FROM documents");
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(result).toEqual([{ id: 1 }]);

      await customManager.close();
    });
  });

  describe("Execute Operations", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should execute INSERT statements", async () => {
      const result = await connectionManager.execute(
        "INSERT INTO documents (url, title, raw_text) VALUES (?, ?, ?)",
        ["https://example.com", "Test", "Content"],
      );

      expect(result).toHaveProperty("changes");
      expect(result).toHaveProperty("lastInsertRowid");
    });

    it("should execute UPDATE statements", async () => {
      const result = await connectionManager.execute(
        "UPDATE documents SET title = ? WHERE id = ?",
        ["New Title", 1],
      );

      expect(result).toHaveProperty("changes");
      expect(result).toHaveProperty("lastInsertRowid");
    });

    it("should execute DELETE statements", async () => {
      const result = await connectionManager.execute("DELETE FROM documents WHERE id = ?", [1]);

      expect(result).toHaveProperty("changes");
      expect(result).toHaveProperty("lastInsertRowid");
    });
  });

  describe("Transaction Handling", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should execute transactions successfully", async () => {
      const result = await connectionManager.transaction(async (db) => {
        await db.execute("INSERT INTO documents (url, raw_text) VALUES (?, ?)", [
          "https://test.com",
          "Test content",
        ]);
        return "success";
      });

      expect(result).toBe("success");
    });

    it("should handle transaction errors", async () => {
      // @ts-ignore - accessing private property for testing
      connectionManager.db.transaction = vi.fn().mockRejectedValue(new Error("Transaction failed"));

      await expect(
        connectionManager.transaction(async (db) => {
          await db.execute("INVALID SQL");
          return "should not reach";
        }),
      ).rejects.toThrow();
    });
  });

  describe("Full-Text Search", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should perform search queries", async () => {
      const results = await connectionManager.search("test query", 10, 0);
      expect(Array.isArray(results)).toBe(true);
    });

    it("should respect limit and offset", async () => {
      const results = await connectionManager.search("test", 5, 10);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Document Operations", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should save a document", async () => {
      const doc = {
        url: "https://example.com",
        title: "Test Document",
        site: "example.com",
        word_count: 100,
        hash: "test-hash",
        raw_text: "Test content",
      };

      const id = await connectionManager.saveDocument(doc);
      expect(id).toBe(1);
    });

    it("should get a document by ID", async () => {
      // @ts-ignore - accessing private property for testing
      connectionManager.db.query = vi.fn().mockResolvedValue([
        {
          id: 1,
          url: "https://example.com",
          title: "Test",
          raw_text: "Content",
        },
      ]);

      const doc = await connectionManager.getDocument(1);
      expect(doc).toBeDefined();
      expect(doc?.id).toBe(1);
    });

    it("should return null for non-existent document", async () => {
      // @ts-ignore - accessing private property for testing
      connectionManager.db.query = vi.fn().mockResolvedValue([]);

      const doc = await connectionManager.getDocument(999);
      expect(doc).toBeNull();
    });

    it("should get document history", async () => {
      const history = await connectionManager.getHistory(50, 0);
      expect(Array.isArray(history)).toBe(true);
    });

    it("should delete all data", async () => {
      await expect(connectionManager.deleteAllData()).resolves.not.toThrow();
    });
  });

  describe("Statistics", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should return database statistics", async () => {
      const stats = await connectionManager.getStats();

      expect(stats).toHaveProperty("documentCount");
      expect(stats).toHaveProperty("summaryCount");
      expect(stats).toHaveProperty("databaseSize");
      expect(typeof stats.documentCount).toBe("number");
      expect(typeof stats.summaryCount).toBe("number");
      expect(typeof stats.databaseSize).toBe("number");
    });
  });

  describe("Retry Logic", () => {
    it("should retry operations on failure", async () => {
      const customManager = new ConnectionManager({
        retryAttempts: 3,
        retryDelay: 50,
        queryTimeout: 1000,
        useOPFS: false,
      });

      await customManager.initialize();

      let attempts = 0;
      // @ts-ignore - accessing private property for testing
      customManager.db.query = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return [{ id: 1 }];
      });

      const result = await customManager.query("SELECT * FROM documents");
      expect(attempts).toBe(3);
      expect(result).toEqual([{ id: 1 }]);

      await customManager.close();
    });

    it("should fail after max retries", async () => {
      const customManager = new ConnectionManager({
        retryAttempts: 2,
        retryDelay: 50,
        queryTimeout: 1000,
        useOPFS: false,
      });

      await customManager.initialize();

      // @ts-ignore - accessing private property for testing
      customManager.db.query = vi.fn().mockRejectedValue(new Error("Permanent failure"));

      await expect(customManager.query("SELECT * FROM documents")).rejects.toThrow(
        "Permanent failure",
      );

      await customManager.close();
    });

    it("should handle operation timeout", async () => {
      const customManager = new ConnectionManager({
        retryAttempts: 1,
        retryDelay: 50,
        queryTimeout: 100,
        useOPFS: false,
      });

      await customManager.initialize();

      // @ts-ignore - accessing private property for testing
      customManager.db.query = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve([]), 200); // Longer than timeout
        });
      });

      await expect(customManager.query("SELECT * FROM documents")).rejects.toThrow(
        /timeout exceeded/,
      );

      await customManager.close();
    });
  });

  describe("Cleanup", () => {
    it("should close database connection properly", async () => {
      await connectionManager.initialize();
      await connectionManager.close();

      // Should be able to reinitialize after closing
      await connectionManager.initialize();
      await connectionManager.close();
    });

    it("should handle close without initialization", async () => {
      await expect(connectionManager.close()).resolves.not.toThrow();
    });
  });
});
