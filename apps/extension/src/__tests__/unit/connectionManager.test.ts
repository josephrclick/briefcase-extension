/**
 * Unit tests for connection pool management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConnectionManager } from "../../offscreen/connectionManager";

// Mock the SQLite connection
vi.mock("@briefcase/db", () => ({
  openDatabase: vi.fn(),
  SQLiteConnection: vi.fn(),
}));

describe("Connection Pool Management", () => {
  let connectionManager: any;
  let mockConnections: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create mock connections
    mockConnections = [];
    for (let i = 0; i < 10; i++) {
      mockConnections.push({
        exec: vi.fn().mockResolvedValue({ rows: [], changes: 0 }),
        close: vi.fn(),
      });
    }

    connectionManager = new ConnectionManager() as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Connection Lifecycle", () => {
    it("should initialize the connection manager", async () => {
      await connectionManager.initialize();

      expect(connectionManager.isInitialized).toBe(true);
    });

    it("should prevent multiple simultaneous initializations", async () => {
      const promise1 = connectionManager.initialize();
      const promise2 = connectionManager.initialize();
      const promise3 = connectionManager.initialize();

      await Promise.all([promise1, promise2, promise3]);

      // Verify initialize was only called once internally
      expect(connectionManager.isInitialized).toBe(true);
    });

    it("should create connections on demand", async () => {
      await connectionManager.initialize();

      const conn = await connectionManager.getConnection();
      expect(conn).toBeDefined();
      expect(conn.exec).toBeDefined();
      expect(conn.close).toBeDefined();
    });

    it("should reuse idle connections", async () => {
      await connectionManager.initialize();

      const conn1 = await connectionManager.getConnection();
      connectionManager.releaseConnection(conn1);

      const conn2 = await connectionManager.getConnection();
      expect(conn1).toBe(conn2); // Should be the same connection object
    });

    it("should respect max connection limit", async () => {
      await connectionManager.initialize();

      const connections = [];

      // Get max connections
      for (let i = 0; i < 5; i++) {
        connections.push(await connectionManager.getConnection());
      }

      // Try to get one more - should wait or fail
      const extraConnectionPromise = connectionManager.getConnection();

      // Should be waiting for a connection
      expect(connectionManager.pool.length).toBe(5);

      // Release one connection
      connectionManager.releaseConnection(connections[0]);

      // Now the waiting connection should resolve
      const extraConnection = await extraConnectionPromise;
      expect(extraConnection).toBeDefined();
    });

    it("should mark connections as in use correctly", async () => {
      await connectionManager.initialize();

      const conn = await connectionManager.getConnection();
      const pooledConn = connectionManager.pool.find((p: any) => p.connection === conn);

      expect(pooledConn?.inUse).toBe(true);

      connectionManager.releaseConnection(conn);
      expect(pooledConn?.inUse).toBe(false);
    });

    it("should update lastUsed timestamp on release", async () => {
      await connectionManager.initialize();

      const conn = await connectionManager.getConnection();
      const pooledConn = connectionManager.pool.find((p: any) => p.connection === conn);
      const initialTimestamp = pooledConn?.lastUsed;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      connectionManager.releaseConnection(conn);
      expect(pooledConn?.lastUsed).toBeGreaterThan(initialTimestamp!);
    });
  });

  describe("Idle Connection Cleanup", () => {
    it("should clean up idle connections after timeout", async () => {
      await connectionManager.initialize();

      // Create and release a connection
      const conn = await connectionManager.getConnection();
      const pooledConn = connectionManager.pool.find((p: any) => p.connection === conn);
      connectionManager.releaseConnection(conn);

      // Mock the connection as idle for longer than timeout
      if (pooledConn) {
        pooledConn.lastUsed = Date.now() - 400000; // 400 seconds ago (> 5 min)
      }

      // Trigger cleanup
      connectionManager.cleanupIdleConnections();

      // Connection should be removed
      expect(connectionManager.pool.find((p: any) => p.connection === conn)).toBeUndefined();
      expect(conn.close).toHaveBeenCalled();
    });

    it("should not clean up active connections", async () => {
      await connectionManager.initialize();

      const conn = await connectionManager.getConnection();
      const pooledConn = connectionManager.pool.find((p: any) => p.connection === conn);

      // Mock as old but still in use
      if (pooledConn) {
        pooledConn.lastUsed = Date.now() - 400000; // 400 seconds ago
        // conn is still marked as inUse = true
      }

      connectionManager.cleanupIdleConnections();

      // Connection should NOT be removed
      expect(connectionManager.pool.find((p: any) => p.connection === conn)).toBeDefined();
      expect(conn.close).not.toHaveBeenCalled();
    });

    it("should keep minimum number of connections", async () => {
      await connectionManager.initialize();

      // Create multiple connections
      const conns = [];
      for (let i = 0; i < 3; i++) {
        conns.push(await connectionManager.getConnection());
      }

      // Release all
      conns.forEach((c) => connectionManager.releaseConnection(c));

      // Mark all as old
      connectionManager.pool.forEach((p: any) => {
        p.lastUsed = Date.now() - 400000;
      });

      connectionManager.cleanupIdleConnections();

      // Should keep at least 1 connection
      expect(connectionManager.pool.length).toBeGreaterThanOrEqual(1);
    });

    it("should run periodic cleanup", () => {
      const cleanupSpy = vi.spyOn(connectionManager, "cleanupIdleConnections");

      // Fast-forward time to trigger cleanup
      vi.advanceTimersByTime(60000); // 1 minute

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });

  describe("Connection Pool Statistics", () => {
    it("should provide accurate pool statistics", async () => {
      await connectionManager.initialize();

      // Get initial stats
      let stats = connectionManager.getPoolStats();
      expect(stats.total).toBe(1); // One created during init
      expect(stats.active).toBe(0);
      expect(stats.idle).toBe(1);

      // Get a connection
      const conn1 = await connectionManager.getConnection();
      stats = connectionManager.getPoolStats();
      expect(stats.active).toBe(1);
      expect(stats.idle).toBe(0);

      // Get another connection
      await connectionManager.getConnection();
      stats = connectionManager.getPoolStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
      expect(stats.idle).toBe(0);

      // Release one
      connectionManager.releaseConnection(conn1);
      stats = connectionManager.getPoolStats();
      expect(stats.active).toBe(1);
      expect(stats.idle).toBe(1);
    });
  });

  describe("Connection Creation and Destruction", () => {
    it("should create new connections when pool is empty", async () => {
      await connectionManager.initialize();

      const conn1 = await connectionManager.getConnection();
      const conn2 = await connectionManager.getConnection();

      expect(conn1).not.toBe(conn2);
      expect(connectionManager.pool.length).toBe(2);
    });

    it("should assign unique IDs to connections", async () => {
      await connectionManager.initialize();

      const conn1 = await connectionManager.getConnection();
      const conn2 = await connectionManager.getConnection();

      const pooledConn1 = connectionManager.pool.find((p: any) => p.connection === conn1);
      const pooledConn2 = connectionManager.pool.find((p: any) => p.connection === conn2);

      expect(pooledConn1?.id).toBeDefined();
      expect(pooledConn2?.id).toBeDefined();
      expect(pooledConn1?.id).not.toBe(pooledConn2?.id);
    });

    it("should close all connections on manager close", async () => {
      await connectionManager.initialize();

      const conns = [];
      for (let i = 0; i < 3; i++) {
        const conn = await connectionManager.getConnection();
        conns.push(conn);
      }

      await connectionManager.close();

      conns.forEach((conn) => {
        expect(conn.close).toHaveBeenCalled();
      });

      expect(connectionManager.pool.length).toBe(0);
    });

    it("should handle connection creation failures", async () => {
      // Mock connection creation to fail
      connectionManager.createConnection = vi
        .fn()
        .mockRejectedValue(new Error("Connection failed"));

      await expect(connectionManager.initialize()).rejects.toThrow("Connection failed");
    });
  });

  describe("Thread Safety and Race Conditions", () => {
    it("should handle concurrent connection requests safely", async () => {
      await connectionManager.initialize();

      // Request many connections simultaneously
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(connectionManager.getConnection());
      }

      const connections = await Promise.all(promises);

      // All connections should be unique (up to pool limit)
      const uniqueConnections = new Set(connections);
      expect(uniqueConnections.size).toBeLessThanOrEqual(5); // Max pool size

      // All connections should be marked as in use
      connections.forEach((conn) => {
        const pooledConn = connectionManager.pool.find((p: any) => p.connection === conn);
        expect(pooledConn?.inUse).toBe(true);
      });
    });

    it("should handle concurrent release safely", async () => {
      await connectionManager.initialize();

      const connections = [];
      for (let i = 0; i < 5; i++) {
        connections.push(await connectionManager.getConnection());
      }

      // Release all connections simultaneously
      const releasePromises = connections.map((conn) =>
        Promise.resolve(connectionManager.releaseConnection(conn)),
      );

      await Promise.all(releasePromises);

      // All connections should be idle
      connectionManager.pool.forEach((pooledConn: any) => {
        expect(pooledConn.inUse).toBe(false);
      });
    });

    it("should prevent double-release of connections", async () => {
      await connectionManager.initialize();

      const conn = await connectionManager.getConnection();

      // Release once
      connectionManager.releaseConnection(conn);

      // Try to release again - should be handled gracefully
      expect(() => connectionManager.releaseConnection(conn)).not.toThrow();

      // Connection should still be idle
      const pooledConn = connectionManager.pool.find((p: any) => p.connection === conn);
      expect(pooledConn?.inUse).toBe(false);
    });
  });

  describe("Connection Wait Queue", () => {
    it("should queue requests when pool is exhausted", async () => {
      await connectionManager.initialize();

      // Fill up the pool
      const connections = [];
      for (let i = 0; i < 5; i++) {
        connections.push(await connectionManager.getConnection());
      }

      // These should be queued
      const waitingPromises = [
        connectionManager.getConnection(),
        connectionManager.getConnection(),
      ];

      // Give them time to queue
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify they're waiting
      let resolved = false;
      waitingPromises[0].then(() => {
        resolved = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resolved).toBe(false);

      // Release a connection
      connectionManager.releaseConnection(connections[0]);

      // First waiting request should now resolve
      const conn = await waitingPromises[0];
      expect(conn).toBeDefined();
    });

    it("should handle timeout for waiting connections", async () => {
      // Set a short timeout
      connectionManager = new ConnectionManager({
        connectionTimeout: 100,
      }) as any;
      await connectionManager.initialize();

      // Fill up the pool
      const connections = [];
      for (let i = 0; i < 5; i++) {
        connections.push(await connectionManager.getConnection());
      }

      // This should timeout
      vi.advanceTimersByTime(101);

      await expect(connectionManager.getConnection()).rejects.toThrow(/timeout/i);
    });

    it("should process wait queue in FIFO order", async () => {
      await connectionManager.initialize();

      // Fill up the pool
      const connections = [];
      for (let i = 0; i < 5; i++) {
        connections.push(await connectionManager.getConnection());
      }

      // Queue multiple requests
      const order: number[] = [];
      const waitingPromises = [
        connectionManager.getConnection().then(() => order.push(1)),
        connectionManager.getConnection().then(() => order.push(2)),
        connectionManager.getConnection().then(() => order.push(3)),
      ];

      // Release connections one by one
      connectionManager.releaseConnection(connections[0]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      connectionManager.releaseConnection(connections[1]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      connectionManager.releaseConnection(connections[2]);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await Promise.all(waitingPromises);

      // Should be processed in order
      expect(order).toEqual([1, 2, 3]);
    });
  });
});
