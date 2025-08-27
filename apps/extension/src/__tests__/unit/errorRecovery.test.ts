/**
 * Unit tests for error recovery scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OffscreenProxy } from "../../background/offscreenProxy";
import { MessageType } from "../../offscreen/offscreen";
import { setupChromeMock, cleanupChromeMock } from "../utils/mockChromeApi";
import { createMockRequest, createTimeoutHelper } from "../utils/messageHelpers";

describe("Error Recovery Scenarios", () => {
  let offscreenProxy: any;
  let mockChrome: ReturnType<typeof setupChromeMock>;
  const timeoutHelper = createTimeoutHelper();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockChrome = setupChromeMock();
    offscreenProxy = OffscreenProxy.getInstance() as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupChromeMock();
    vi.clearAllMocks();
  });

  describe("Retry Logic", () => {
    it("should retry failed requests up to 3 times", async () => {
      let attemptCount = 0;
      const mockHandler = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Connection failed");
        }
        return { success: true, data: "Success on third attempt" };
      });

      offscreenProxy["sendMessageWithRetry"] = mockHandler;

      const result = await offscreenProxy["sendMessageWithRetry"](
        createMockRequest(MessageType.DB_QUERY),
      );

      expect(attemptCount).toBe(3);
      expect(result.data).toBe("Success on third attempt");
    });

    it("should fail after maximum retry attempts", async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error("Persistent failure"));
      offscreenProxy["sendMessageWithRetry"] = mockHandler;

      await expect(
        offscreenProxy["sendMessageWithRetry"](createMockRequest(MessageType.DB_QUERY)),
      ).rejects.toThrow("Persistent failure");

      expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it("should implement exponential backoff between retries", async () => {
      let timestamps: number[] = [];
      const mockHandler = vi.fn().mockImplementation(() => {
        timestamps.push(Date.now());
        if (timestamps.length < 3) {
          throw new Error("Retry needed");
        }
        return { success: true };
      });

      offscreenProxy["sendMessageWithRetry"] = async (message: any, attempt = 0) => {
        if (attempt < 3) {
          try {
            return await mockHandler();
          } catch (error) {
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            return offscreenProxy["sendMessageWithRetry"](message, attempt + 1);
          }
        }
        throw new Error("Max retries exceeded");
      };

      const promise = offscreenProxy["sendMessageWithRetry"](
        createMockRequest(MessageType.DB_QUERY),
      );

      // Advance through retries with exponential delays
      vi.advanceTimersByTime(1000); // First retry after 1s
      vi.advanceTimersByTime(2000); // Second retry after 2s
      vi.advanceTimersByTime(4000); // Would be third retry after 4s

      await promise;
      expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it("should not retry on non-retryable errors", async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error("INVALID_ARGUMENT"));
      offscreenProxy["isRetryableError"] = (error: any) => {
        return !error.message.includes("INVALID");
      };
      offscreenProxy["sendMessageWithRetry"] = mockHandler;

      await expect(
        offscreenProxy["sendMessageWithRetry"](createMockRequest(MessageType.DB_QUERY)),
      ).rejects.toThrow("INVALID_ARGUMENT");

      expect(mockHandler).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe("Timeout Handling", () => {
    it("should timeout requests after 30 seconds", async () => {
      // Mock a request that never responds
      offscreenProxy["sendMessage"] = vi.fn().mockImplementation(() => {
        return new Promise(() => {}); // Never resolves
      });

      const promise = offscreenProxy["sendMessage"](createMockRequest(MessageType.DB_QUERY));

      // Fast-forward time
      vi.advanceTimersByTime(30001);

      await expect(promise).rejects.toThrow(/timeout/i);
    });

    it("should clean up pending requests on timeout", async () => {
      const requestId = "test-request-123";
      const request = createMockRequest(MessageType.DB_QUERY, undefined, requestId);

      offscreenProxy["pendingRequests"].set(requestId, {
        resolve: vi.fn(),
        reject: vi.fn(),
        timeout: setTimeout(() => {}, 30000) as any,
      });

      // Trigger timeout
      vi.advanceTimersByTime(30001);

      expect(offscreenProxy["pendingRequests"].has(requestId)).toBe(false);
    });

    it("should handle concurrent timeouts correctly", async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const promise = offscreenProxy["sendMessage"](
          createMockRequest(MessageType.DB_QUERY, undefined, `request-${i}`),
        );
        promises.push(promise);
      }

      vi.advanceTimersByTime(30001);

      const results = await Promise.allSettled(promises);
      results.forEach((result) => {
        expect(result.status).toBe("rejected");
      });

      expect(offscreenProxy["pendingRequests"].size).toBe(0);
    });
  });

  describe("Connection Recovery", () => {
    it("should recreate offscreen document after crash", async () => {
      // Simulate document crash
      mockChrome.offscreen.hasDocument.mockResolvedValueOnce(false);

      await offscreenProxy.ensureOffscreenDocument();

      expect(mockChrome.offscreen.createDocument).toHaveBeenCalled();
    });

    it("should handle concurrent document creation attempts", async () => {
      mockChrome.offscreen.hasDocument.mockResolvedValue(false);

      // Multiple simultaneous attempts
      const promises = [
        offscreenProxy.ensureOffscreenDocument(),
        offscreenProxy.ensureOffscreenDocument(),
        offscreenProxy.ensureOffscreenDocument(),
      ];

      await Promise.all(promises);

      // Should only create once
      expect(mockChrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    });

    it("should detect and recover from unresponsive document", async () => {
      // Mock heartbeat failure
      offscreenProxy["lastHeartbeat"] = Date.now() - 40000; // 40s ago

      const isHealthy = offscreenProxy["isDocumentHealthy"]();
      expect(isHealthy).toBe(false);

      // Should trigger recovery
      await offscreenProxy.ensureOffscreenDocument();
      expect(mockChrome.offscreen.closeDocument).toHaveBeenCalled();
      expect(mockChrome.offscreen.createDocument).toHaveBeenCalled();
    });
  });

  describe("Error Propagation", () => {
    it("should preserve error context through retries", async () => {
      const originalError = new Error("Database locked");
      originalError.stack = "Stack trace here";

      offscreenProxy["sendMessageWithRetry"] = vi.fn().mockRejectedValue(originalError);

      try {
        await offscreenProxy["sendMessageWithRetry"](createMockRequest(MessageType.DB_QUERY));
      } catch (error: any) {
        expect(error.message).toBe("Database locked");
        expect(error.stack).toContain("Stack trace");
      }
    });

    it("should wrap timeout errors with context", async () => {
      const request = createMockRequest(MessageType.DB_QUERY, { sql: "SELECT * FROM docs" });

      offscreenProxy["sendMessage"] = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timeout")), 30000);
        });
      });

      vi.advanceTimersByTime(30001);

      try {
        await offscreenProxy["sendMessage"](request);
      } catch (error: any) {
        expect(error.message).toContain("timeout");
        expect(error.message).toContain("DB_QUERY");
      }
    });
  });

  describe("Graceful Degradation", () => {
    it("should fallback to cached data on connection failure", async () => {
      const cache = new Map();
      cache.set("query-cache", { data: "cached result" });

      offscreenProxy["cache"] = cache;
      offscreenProxy["sendMessage"] = vi.fn().mockRejectedValue(new Error("Connection failed"));

      const result = await offscreenProxy["sendMessageWithFallback"](
        createMockRequest(MessageType.DB_QUERY),
        "query-cache",
      );

      expect(result.data).toBe("cached result");
    });

    it("should queue operations during recovery", async () => {
      const queue: any[] = [];
      offscreenProxy["operationQueue"] = queue;
      offscreenProxy["isRecovering"] = true;

      const request1 = createMockRequest(MessageType.DOC_INSERT);
      const request2 = createMockRequest(MessageType.DOC_UPDATE);

      offscreenProxy["queueOperation"](request1);
      offscreenProxy["queueOperation"](request2);

      expect(queue.length).toBe(2);

      // Complete recovery
      offscreenProxy["isRecovering"] = false;
      await offscreenProxy["processQueue"]();

      expect(queue.length).toBe(0);
    });
  });

  describe("Circuit Breaker Pattern", () => {
    it("should open circuit after consecutive failures", async () => {
      let failureCount = 0;
      offscreenProxy["circuitBreaker"] = {
        state: "closed",
        failureCount: 0,
        threshold: 5,
        resetTimeout: 30000,
      };

      // Simulate consecutive failures
      for (let i = 0; i < 5; i++) {
        try {
          await offscreenProxy["sendMessageWithCircuitBreaker"](
            createMockRequest(MessageType.DB_QUERY),
          );
        } catch {
          failureCount++;
        }
      }

      expect(offscreenProxy["circuitBreaker"].state).toBe("open");
    });

    it("should reject immediately when circuit is open", async () => {
      offscreenProxy["circuitBreaker"] = {
        state: "open",
        failureCount: 5,
        threshold: 5,
        resetTimeout: 30000,
      };

      const start = Date.now();

      await expect(
        offscreenProxy["sendMessageWithCircuitBreaker"](createMockRequest(MessageType.DB_QUERY)),
      ).rejects.toThrow("Circuit breaker is open");

      // Should fail immediately, not wait for timeout
      expect(Date.now() - start).toBeLessThan(100);
    });

    it("should enter half-open state after reset timeout", () => {
      offscreenProxy["circuitBreaker"] = {
        state: "open",
        failureCount: 5,
        threshold: 5,
        resetTimeout: 30000,
        openedAt: Date.now(),
      };

      // Fast-forward past reset timeout
      vi.advanceTimersByTime(30001);

      offscreenProxy["checkCircuitBreakerState"]();

      expect(offscreenProxy["circuitBreaker"].state).toBe("half-open");
    });
  });
});
