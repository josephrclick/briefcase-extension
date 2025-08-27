/**
 * Unit tests for message protocol validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MessageRouter,
  createSuccessResponse,
  createErrorResponse,
  generateMessageId,
  type RequestMessage,
  MessageSource,
} from "../../types/messages";
import { MessageType } from "../../offscreen/offscreen";
import { setupChromeMock, cleanupChromeMock } from "../utils/mockChromeApi";
import { createMockRequest } from "../utils/messageHelpers";

describe("Message Protocol Validation", () => {
  let mockChrome: ReturnType<typeof setupChromeMock>;

  beforeEach(() => {
    mockChrome = setupChromeMock();
  });

  afterEach(() => {
    cleanupChromeMock();
    vi.clearAllMocks();
  });

  describe("MessageRouter", () => {
    let router: MessageRouter;

    beforeEach(() => {
      router = new MessageRouter();
    });

    it("should register and route messages to the correct handler", async () => {
      const handler = vi.fn().mockResolvedValue({
        type: MessageType.DB_QUERY,
        success: true,
        data: { rows: [] },
      });

      router.register(MessageType.DB_QUERY, handler);

      const request = createMockRequest(MessageType.DB_QUERY, { sql: "SELECT * FROM documents" });
      const response = await router.route(request);

      expect(handler).toHaveBeenCalledWith(request, undefined);
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ rows: [] });
    });

    it("should handle multiple registered handlers", async () => {
      const queryHandler = vi.fn().mockResolvedValue({
        type: MessageType.DB_QUERY,
        success: true,
        data: { rows: [] },
      });

      const insertHandler = vi.fn().mockResolvedValue({
        type: MessageType.DOC_INSERT,
        success: true,
        data: { id: 1 },
      });

      router.register(MessageType.DB_QUERY, queryHandler);
      router.register(MessageType.DOC_INSERT, insertHandler);

      const queryRequest = createMockRequest(MessageType.DB_QUERY);
      const insertRequest = createMockRequest(MessageType.DOC_INSERT);

      await router.route(queryRequest);
      await router.route(insertRequest);

      expect(queryHandler).toHaveBeenCalledTimes(1);
      expect(insertHandler).toHaveBeenCalledTimes(1);
    });

    it("should return error response for unregistered message types", async () => {
      const request = createMockRequest(MessageType.DB_QUERY);
      const response = await router.route(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("UNKNOWN_MESSAGE_TYPE");
      expect(response.error?.message).toContain("No handler registered");
    });

    it("should handle handler errors gracefully", async () => {
      const errorMessage = "Database connection failed";
      const handler = vi.fn().mockRejectedValue(new Error(errorMessage));

      router.register(MessageType.DB_QUERY, handler);

      const request = createMockRequest(MessageType.DB_QUERY);
      const response = await router.route(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("HANDLER_ERROR");
      expect(response.error?.message).toBe(errorMessage);
    });

    it("should handle synchronous handlers", async () => {
      const handler = vi.fn().mockReturnValue({
        type: MessageType.HEARTBEAT,
        success: true,
        data: { alive: true },
      });

      router.register(MessageType.HEARTBEAT, handler);

      const request = createMockRequest(MessageType.HEARTBEAT);
      const response = await router.route(request);

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ alive: true });
    });

    it("should preserve message metadata through routing", async () => {
      const handler = vi.fn((message: RequestMessage) => ({
        type: message.type,
        id: message.id,
        timestamp: Date.now(),
        success: true,
      }));

      router.register(MessageType.DB_QUERY, handler);

      const request = createMockRequest(MessageType.DB_QUERY, undefined, "custom-id-123");
      const response = await router.route(request);

      expect(response.id).toBe("custom-id-123");
      expect(response.type).toBe(MessageType.DB_QUERY);
    });

    it("should setup Chrome runtime listener correctly", () => {
      router.listen();

      // Verify that a listener was added
      expect(mockChrome.runtime.onMessage["listeners"].length).toBe(1);
    });

    it("should handle Chrome runtime messages correctly", async () => {
      const handler = vi.fn().mockResolvedValue({
        type: MessageType.DB_QUERY,
        success: true,
        data: { result: "test" },
      });

      router.register(MessageType.DB_QUERY, handler);
      router.listen();

      const sendResponse = vi.fn();
      const message = createMockRequest(MessageType.DB_QUERY);
      const sender = { tab: { id: 1, url: "https://example.com", title: "Test" } };

      // Trigger the listener
      mockChrome.runtime.onMessage.trigger(message, sender, sendResponse);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith(message, sender);
      expect(sendResponse).toHaveBeenCalled();

      const response = sendResponse.mock.calls[0][0];
      expect(response.success).toBe(true);
    });
  });

  describe("Message Helper Functions", () => {
    describe("generateMessageId", () => {
      it("should generate unique IDs", () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
          ids.add(generateMessageId());
        }
        expect(ids.size).toBe(100);
      });

      it("should include prefix when provided", () => {
        const id = generateMessageId("test");
        expect(id).toMatch(/^test-\d+-[a-z0-9]+$/);
      });

      it("should generate valid format without prefix", () => {
        const id = generateMessageId();
        expect(id).toMatch(/^\d+-[a-z0-9]+$/);
      });
    });

    describe("createSuccessResponse", () => {
      it("should create a success response with data", () => {
        const request = createMockRequest(MessageType.DB_QUERY);
        const data = { rows: [{ id: 1, name: "test" }] };
        const response = createSuccessResponse(request, data);

        expect(response.type).toBe(MessageType.DB_QUERY);
        expect(response.id).toBe(request.id);
        expect(response.success).toBe(true);
        expect(response.data).toEqual(data);
        expect(response.error).toBeUndefined();
      });

      it("should create a success response without data", () => {
        const request = createMockRequest(MessageType.DB_CLOSE);
        const response = createSuccessResponse(request);

        expect(response.success).toBe(true);
        expect(response.data).toBeUndefined();
      });
    });

    describe("createErrorResponse", () => {
      it("should create error response from Error object", () => {
        const request = createMockRequest(MessageType.DB_QUERY);
        const error = new Error("Connection timeout");
        const response = createErrorResponse(request, error);

        expect(response.type).toBe(MessageType.DB_QUERY);
        expect(response.id).toBe(request.id);
        expect(response.success).toBe(false);
        expect(response.error?.code).toBe("ERROR");
        expect(response.error?.message).toBe("Connection timeout");
        expect(response.error?.details).toContain("Error");
      });

      it("should handle non-Error objects", () => {
        const request = createMockRequest(MessageType.DB_QUERY);
        const response = createErrorResponse(request, "String error");

        expect(response.success).toBe(false);
        expect(response.error?.code).toBe("UNKNOWN_ERROR");
        expect(response.error?.message).toBe("String error");
        expect(response.error?.details).toBeUndefined();
      });

      it("should handle null/undefined errors", () => {
        const request = createMockRequest(MessageType.DB_QUERY);
        const response = createErrorResponse(request, null);

        expect(response.success).toBe(false);
        expect(response.error?.code).toBe("UNKNOWN_ERROR");
        expect(response.error?.message).toBe("null");
      });
    });
  });

  describe("Message Type Enumeration", () => {
    it("should have all required message types", () => {
      const requiredTypes = [
        "DB_INIT",
        "DB_QUERY",
        "DB_EXECUTE",
        "DB_TRANSACTION",
        "DB_CLOSE",
        "DOC_INSERT",
        "DOC_UPDATE",
        "DOC_DELETE",
        "DOC_SEARCH",
        "DOC_GET",
        "SUMMARY_INSERT",
        "SUMMARY_GET",
        "SUMMARY_LIST",
        "AB_RUN_INSERT",
        "AB_SCORE_INSERT",
        "AB_GET_RESULTS",
        "SUCCESS",
        "ERROR",
        "HEARTBEAT",
      ];

      requiredTypes.forEach((type) => {
        expect(MessageType[type as keyof typeof MessageType]).toBeDefined();
      });
    });
  });

  describe("Message Source Enumeration", () => {
    it("should have all required message sources", () => {
      const requiredSources = [
        "SERVICE_WORKER",
        "OFFSCREEN_DOCUMENT",
        "CONTENT_SCRIPT",
        "SIDE_PANEL",
        "POPUP",
      ];

      requiredSources.forEach((source) => {
        expect(MessageSource[source as keyof typeof MessageSource]).toBeDefined();
      });
    });
  });

  describe("Message Validation", () => {
    it("should validate required message fields", () => {
      const isValidMessage = (msg: any): msg is RequestMessage => {
        return (
          typeof msg.type === "string" &&
          (msg.id === undefined || typeof msg.id === "string") &&
          (msg.timestamp === undefined || typeof msg.timestamp === "number")
        );
      };

      expect(isValidMessage({ type: MessageType.DB_QUERY })).toBe(true);
      expect(isValidMessage({ type: MessageType.DB_QUERY, id: "123" })).toBe(true);
      expect(isValidMessage({ type: MessageType.DB_QUERY, timestamp: Date.now() })).toBe(true);
      expect(isValidMessage({})).toBe(false);
      expect(isValidMessage({ id: "123" })).toBe(false);
      expect(isValidMessage({ type: 123 })).toBe(false);
    });

    it("should handle message payload types correctly", () => {
      interface QueryPayload {
        sql: string;
        params?: unknown[];
      }

      const message: RequestMessage<QueryPayload> = {
        type: MessageType.DB_QUERY,
        payload: {
          sql: "SELECT * FROM documents WHERE id = ?",
          params: [1],
        },
      };

      expect(message.payload?.sql).toBe("SELECT * FROM documents WHERE id = ?");
      expect(message.payload?.params).toEqual([1]);
    });
  });
});
