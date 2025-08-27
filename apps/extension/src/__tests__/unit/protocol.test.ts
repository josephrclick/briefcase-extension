/**
 * Tests for the database message protocol
 * Covers message routing, streaming, error handling, and all database operations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageRouter, generateMessageId } from "../../types/messages";
import { MessageType } from "../../offscreen/offscreen";
import {
  DbSearchRequest,
  DbDeleteAllRequest,
  DbGetHistoryRequest,
  DbExportDocumentsRequest,
  DbCancelExportRequest,
  DbExportChunk,
  DbExportProgress,
  generateExportId,
  calculateETA,
  formatBytes,
  isDbError,
  isExportProgress,
  isExportChunk,
} from "../../types/database";
import {
  StreamManager,
  StreamReader,
  ProgressReporter,
  createDataStream,
} from "../../types/streaming";
import {
  createExtendedError,
  RetryHandler,
  ErrorLogger,
  isRecoverableError,
  isRetryableError,
  withErrorHandling,
  RECOVERY_STRATEGIES,
  USER_ERROR_MESSAGES,
  DbErrorCode,
} from "../../types/errors";

describe("Database Message Protocol", () => {
  let messageRouter: MessageRouter;
  let streamManager: StreamManager;

  beforeEach(() => {
    messageRouter = new MessageRouter();
    streamManager = new StreamManager();
  });

  describe("Message Routing", () => {
    it("should route database messages to correct handlers", async () => {
      const searchHandler = vi.fn().mockResolvedValue({
        type: MessageType.DB_SEARCH_RESPONSE,
        success: true,
        data: { results: [], meta: { total: 0 } },
      });

      messageRouter.register(MessageType.DB_SEARCH, searchHandler);

      const request: DbSearchRequest = {
        type: MessageType.DB_SEARCH,
        id: generateMessageId(),
        timestamp: Date.now(),
        payload: { query: "test" },
      };

      const response = await messageRouter.route(request);

      expect(searchHandler).toHaveBeenCalledWith(request, undefined);
      expect(response.success).toBe(true);
    });

    it("should handle unknown message types", async () => {
      const request = {
        type: "UNKNOWN_TYPE",
        id: generateMessageId(),
        timestamp: Date.now(),
      };

      const response = await messageRouter.route(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("UNKNOWN_MESSAGE_TYPE");
    });

    it("should handle handler errors", async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error("Handler failed"));
      messageRouter.register("TEST_ERROR", errorHandler);

      const request = {
        type: "TEST_ERROR",
        id: generateMessageId(),
        timestamp: Date.now(),
      };

      const response = await messageRouter.route(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("HANDLER_ERROR");
      expect(response.error?.message).toContain("Handler failed");
    });

    it("should correlate requests and responses with IDs", async () => {
      const requestId = generateMessageId("test");
      const handler = vi.fn().mockImplementation((msg) => ({
        type: msg.type,
        id: msg.id,
        success: true,
        data: "response",
      }));

      messageRouter.register("TEST", handler);

      const request = {
        type: "TEST",
        id: requestId,
        timestamp: Date.now(),
      };

      const response = await messageRouter.route(request);

      expect(response.id).toBe(requestId);
    });
  });

  describe("Streaming Operations", () => {
    it("should create and manage streams", async () => {
      const streamId = await streamManager.createStream({
        type: "export",
      });

      expect(streamId).toBeTruthy();
      expect(streamManager.getStreamState(streamId)).toBeDefined();
      expect(streamManager.getStreamState(streamId)?.status).toBe("active");
    });

    it("should send data in chunks", async () => {
      const streamId = await streamManager.createStream({
        type: "export",
      });

      const data = "a".repeat(1024 * 128); // 128KB of data
      const chunks: DbExportChunk[] = [];

      for await (const chunk of streamManager.sendData(streamId, data)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1); // Should be chunked
      expect(chunks[0].payload.isFirst).toBe(true);
      expect(chunks[chunks.length - 1].payload.isLast).toBe(true);

      // Verify sequence numbers
      chunks.forEach((chunk, index) => {
        expect(chunk.payload.sequenceNumber).toBe(index);
      });
    });

    it("should handle stream cancellation", async () => {
      const streamId = await streamManager.createStream({
        type: "export",
      });

      await streamManager.cancelStream(streamId, "User cancelled");

      const state = streamManager.getStreamState(streamId);
      expect(state?.status).toBe("cancelled");
    });

    it("should pause and resume streams", () => {
      const streamId = "test-stream";
      streamManager["streams"].set(streamId, {
        id: streamId,
        type: "export",
        status: "active",
        startTime: Date.now(),
        lastActivity: Date.now(),
        progress: { current: 0, total: 100, percentage: 0 },
      });

      streamManager.pauseStream(streamId);
      expect(streamManager.getStreamState(streamId)?.status).toBe("paused");

      streamManager.resumeStream(streamId);
      expect(streamManager.getStreamState(streamId)?.status).toBe("active");
    });

    it("should reassemble chunks correctly", () => {
      const reader = new StreamReader();
      const chunks: DbExportChunk[] = [
        {
          type: MessageType.DB_EXPORT_CHUNK,
          id: "1",
          timestamp: Date.now(),
          success: true,
          payload: {
            exportId: "test",
            sequenceNumber: 0,
            chunk: "Hello ",
            encoding: "utf8",
            isFirst: true,
            isLast: false,
            metadata: { totalChunks: 3, totalSize: 17, mimeType: "text/plain" },
          },
        },
        {
          type: MessageType.DB_EXPORT_CHUNK,
          id: "2",
          timestamp: Date.now(),
          success: true,
          payload: {
            exportId: "test",
            sequenceNumber: 1,
            chunk: "World ",
            encoding: "utf8",
            isFirst: false,
            isLast: false,
          },
        },
        {
          type: MessageType.DB_EXPORT_CHUNK,
          id: "3",
          timestamp: Date.now(),
          success: true,
          payload: {
            exportId: "test",
            sequenceNumber: 2,
            chunk: "Test!",
            encoding: "utf8",
            isFirst: false,
            isLast: true,
          },
        },
      ];

      chunks.forEach((chunk) => reader.processChunk(chunk));

      expect(reader.isComplete()).toBe(true);
      expect(reader.getData()).toBe("Hello World Test!");
    });

    it("should report progress correctly", () => {
      const progressUpdates: number[] = [];
      const reporter = new ProgressReporter(
        100,
        (progress) => {
          progressUpdates.push(progress.payload.percentage);
        },
        "test-export",
      );

      reporter.update(25);
      reporter.update(50);
      reporter.update(75);
      reporter.complete();

      expect(progressUpdates).toContain(25);
      expect(progressUpdates).toContain(50);
      expect(progressUpdates).toContain(75);
      expect(progressUpdates).toContain(100);
    });
  });

  describe("Error Handling", () => {
    it("should create extended errors with recovery strategies", () => {
      const error = createExtendedError(DbErrorCode.QUOTA_EXCEEDED, "Storage full", {
        used: 1024,
        limit: 1024,
      });

      expect(error.code).toBe(DbErrorCode.QUOTA_EXCEEDED);
      expect(error.userMessage).toContain("Storage quota exceeded");
      expect(error.recoverable).toBe(true);
      expect(error.retryable).toBe(false);
      expect(error.context?.used).toBe(1024);
    });

    it("should have recovery strategies for all error codes", () => {
      Object.values(DbErrorCode).forEach((code) => {
        expect(RECOVERY_STRATEGIES[code]).toBeDefined();
        expect(USER_ERROR_MESSAGES[code]).toBeDefined();
      });
    });

    it("should retry operations with exponential backoff", async () => {
      const retryHandler = new RetryHandler();
      let attempts = 0;
      const operation = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Retry me");
        }
        return "success";
      });

      const result = await retryHandler.retry("test-op", operation, DbErrorCode.CONNECTION_LOST);

      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("should handle non-retryable errors", async () => {
      const retryHandler = new RetryHandler();
      const operation = vi
        .fn()
        .mockRejectedValue(createExtendedError(DbErrorCode.PERMISSION_DENIED));

      await expect(
        retryHandler.retry("test-op", operation, DbErrorCode.PERMISSION_DENIED),
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(1); // No retry for permission denied
    });

    it("should log errors with correct severity", () => {
      const errorLogger = new ErrorLogger();
      const consoleSpy = vi.spyOn(console, "error");

      errorLogger.log(createExtendedError(DbErrorCode.OPFS_UNAVAILABLE));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[CRITICAL]"),
        expect.any(Object),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Database Operations", () => {
    describe("Search", () => {
      it("should create valid search requests", () => {
        const request: DbSearchRequest = {
          type: MessageType.DB_SEARCH,
          id: generateMessageId(),
          timestamp: Date.now(),
          payload: {
            query: "test query",
            limit: 10,
            offset: 20,
            sortBy: "relevance",
            sortOrder: "desc",
          },
        };

        expect(request.type).toBe(MessageType.DB_SEARCH);
        expect(request.payload.query).toBe("test query");
      });
    });

    describe("Delete All", () => {
      it("should require confirmation for delete all", () => {
        const request: DbDeleteAllRequest = {
          type: MessageType.DB_DELETE_ALL_DATA,
          id: generateMessageId(),
          timestamp: Date.now(),
          payload: { confirm: true },
        };

        expect(request.payload?.confirm).toBe(true);
      });
    });

    describe("History", () => {
      it("should support date range filters", () => {
        const request: DbGetHistoryRequest = {
          type: MessageType.DB_GET_HISTORY,
          id: generateMessageId(),
          timestamp: Date.now(),
          payload: {
            dateRange: {
              start: new Date("2024-01-01"),
              end: new Date("2024-12-31"),
            },
            site: "example.com",
          },
        };

        expect(request.payload?.dateRange).toBeDefined();
        expect(request.payload?.site).toBe("example.com");
      });
    });

    describe("Export", () => {
      it("should create export requests with options", () => {
        const request: DbExportDocumentsRequest = {
          type: MessageType.DB_EXPORT_DOCUMENTS,
          id: generateMessageId(),
          timestamp: Date.now(),
          payload: {
            format: "json",
            filters: {
              dateRange: {
                start: new Date("2024-01-01"),
                end: new Date("2024-12-31"),
              },
              tags: ["important"],
            },
            options: {
              chunkSize: 100,
              compress: true,
              includeMetadata: true,
            },
            exportId: generateExportId(),
          },
        };

        expect(request.payload.format).toBe("json");
        expect(request.payload.options?.compress).toBe(true);
        expect(request.payload.exportId).toMatch(/^export-\d+-\w+$/);
      });

      it("should support cancellation", () => {
        const request: DbCancelExportRequest = {
          type: MessageType.DB_CANCEL_EXPORT,
          id: generateMessageId(),
          timestamp: Date.now(),
          payload: {
            exportId: "export-123",
            reason: "User cancelled",
          },
        };

        expect(request.payload.exportId).toBe("export-123");
      });
    });
  });

  describe("Utility Functions", () => {
    it("should generate unique message IDs", () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-\w+$/);
    });

    it("should generate export IDs with prefix", () => {
      const exportId = generateExportId("custom");
      expect(exportId).toMatch(/^custom-\d+-\w+$/);
    });

    it("should calculate ETA correctly", () => {
      const eta = calculateETA(50, 100, 5000); // 50% done in 5 seconds
      expect(eta).toBeCloseTo(5000, -2); // ~5 seconds remaining
    });

    it("should format bytes correctly", () => {
      expect(formatBytes(0)).toBe("0.00 B");
      expect(formatBytes(1024)).toBe("1.00 KB");
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    });

    it("should have working type guards", () => {
      const errorMsg: any = {
        type: MessageType.DB_ERROR,
        success: false,
      };

      const progressMsg: any = {
        type: MessageType.DB_EXPORT_PROGRESS,
      };

      const chunkMsg: any = {
        type: MessageType.DB_EXPORT_CHUNK,
      };

      expect(isDbError(errorMsg)).toBe(true);
      expect(isExportProgress(progressMsg)).toBe(true);
      expect(isExportChunk(chunkMsg)).toBe(true);
    });

    it("should wrap functions with error handling", async () => {
      const dangerousFunc = async (x: number) => {
        if (x < 0) throw new Error("Negative not allowed");
        return x * 2;
      };

      const safeFunc = withErrorHandling(dangerousFunc, DbErrorCode.INVALID_REQUEST);

      await expect(safeFunc(5)).resolves.toBe(10);
      await expect(safeFunc(-1)).rejects.toThrow();
    });

    it("should identify recoverable and retryable errors", () => {
      const recoverableError = createExtendedError(DbErrorCode.CONNECTION_LOST);
      const nonRecoverableError = new Error("Generic error");

      expect(isRecoverableError(recoverableError)).toBe(true);
      expect(isRetryableError(recoverableError)).toBe(true);
      expect(isRecoverableError(nonRecoverableError)).toBe(false);
    });
  });

  describe("Stream Data Generator", () => {
    it("should create async data streams", async () => {
      const data = Array.from({ length: 250 }, (_, i) => ({ id: i, value: `item-${i}` }));
      const chunks: string[] = [];

      for await (const chunk of createDataStream(data, 100)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(3); // 250 items / 100 per chunk = 3 chunks

      // Verify data integrity
      const allData = chunks.flatMap((c) => JSON.parse(c));
      expect(allData.length).toBe(250);
      expect(allData[0]).toEqual({ id: 0, value: "item-0" });
      expect(allData[249]).toEqual({ id: 249, value: "item-249" });
    });

    it("should apply transformers to stream data", async () => {
      const data = [1, 2, 3, 4, 5];
      const transformer = (items: number[]) => items.map((n) => n * 2).join(",");
      const chunks: string[] = [];

      for await (const chunk of createDataStream(data, 2, transformer)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["2,4", "6,8", "10"]);
    });
  });

  describe("Integration", () => {
    it("should handle streaming exports end-to-end", async () => {
      const router = new MessageRouter();
      const exportId = generateExportId();
      const receivedChunks: DbExportChunk[] = [];
      const progressUpdates: DbExportProgress[] = [];

      // Register stream handler
      router.registerStreamHandler(exportId, async (message) => {
        if (isExportChunk(message)) {
          receivedChunks.push(message as DbExportChunk);
        } else if (isExportProgress(message)) {
          progressUpdates.push(message as DbExportProgress);
        }
      });

      // Simulate sending chunks
      const chunks = ["chunk1", "chunk2", "chunk3"];
      for (let i = 0; i < chunks.length; i++) {
        const chunk: DbExportChunk = {
          type: MessageType.DB_EXPORT_CHUNK,
          id: generateMessageId(),
          timestamp: Date.now(),
          success: true,
          payload: {
            exportId,
            sequenceNumber: i,
            chunk: chunks[i],
            encoding: "utf8",
            isFirst: i === 0,
            isLast: i === chunks.length - 1,
            metadata:
              i === 0
                ? {
                    totalChunks: chunks.length,
                    totalSize: chunks.join("").length,
                    mimeType: "text/plain",
                  }
                : undefined,
          },
        };

        await router["handleStreamingMessage"](chunk);
      }

      expect(receivedChunks).toHaveLength(chunks.length);
      router.unregisterStreamHandler(exportId);
    });
  });
});
