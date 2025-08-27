/**
 * Helper utilities for testing message passing
 */

import { vi } from "vitest";
import type { RequestMessage, ResponseMessage } from "../../types/messages";
import { MessageType } from "../../offscreen/offscreen";

export function createMockRequest<T = unknown>(
  type: MessageType,
  payload?: T,
  id?: string,
): RequestMessage<T> {
  return {
    type,
    id: id || `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    timestamp: Date.now(),
    payload,
  };
}

export function createMockResponse<T = unknown>(
  request: RequestMessage,
  success: boolean,
  data?: T,
  error?: { code: string; message: string; details?: string },
): ResponseMessage<T> {
  return {
    type: request.type,
    id: request.id,
    timestamp: Date.now(),
    success,
    data,
    error,
  };
}

export function createSuccessMockResponse<T = unknown>(
  request: RequestMessage,
  data?: T,
): ResponseMessage<T> {
  return createMockResponse(request, true, data);
}

export function createErrorMockResponse(
  request: RequestMessage,
  code: string,
  message: string,
  details?: string,
): ResponseMessage {
  return createMockResponse(request, false, undefined, { code, message, details });
}

export async function waitForMessage(timeout: number = 1000, check: () => boolean): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timeout waiting for message");
}

export function createMessageSpy() {
  const messages: Array<{ message: unknown; sender: unknown; response?: unknown }> = [];

  const spy = vi.fn(
    (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => {
      const entry = { message, sender, response: undefined as unknown };
      messages.push(entry);

      // Wrap sendResponse to capture the response
      const wrappedSendResponse = (response?: unknown) => {
        entry.response = response;
        sendResponse(response);
      };

      return wrappedSendResponse;
    },
  );

  return {
    spy,
    messages,
    getLastMessage: () => messages[messages.length - 1],
    getMessageByType: (type: string) =>
      messages.find((m) => (m.message as Record<string, unknown>).type === type),
    getAllMessages: () => messages,
    clear: () => (messages.length = 0),
    waitForMessage: async (type: string, timeout = 1000) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const message = messages.find((m) => (m.message as Record<string, unknown>).type === type);
        if (message) {
          return message;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Timeout waiting for message type: ${type}`);
    },
  };
}

export class MessageQueue {
  private queue: Array<{ resolve: (value: unknown) => void; message: unknown }> = [];

  async enqueue<T = unknown>(message: unknown): Promise<T> {
    return new Promise((resolve) => {
      this.queue.push({ resolve: resolve as (value: unknown) => void, message });
    }) as Promise<T>;
  }

  process(response: unknown) {
    const item = this.queue.shift();
    if (item) {
      item.resolve(response);
    }
  }

  processAll(responses: unknown[]) {
    responses.forEach((response) => this.process(response));
  }

  clear() {
    this.queue = [];
  }

  get length() {
    return this.queue.length;
  }
}

export function mockConnectionManager() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnection: vi.fn().mockResolvedValue({
      exec: vi.fn().mockResolvedValue({ rows: [], changes: 0 }),
      close: vi.fn(),
    }),
    releaseConnection: vi.fn(),
    executeQuery: vi.fn().mockResolvedValue({ rows: [], changes: 0 }),
    executeTransaction: vi.fn().mockResolvedValue({ success: true }),
    close: vi.fn().mockResolvedValue(undefined),
    getPoolStats: vi.fn().mockReturnValue({
      total: 5,
      active: 0,
      idle: 5,
    }),
  };
}

export function createTimeoutHelper(defaultTimeout = 5000) {
  return {
    race: <T>(promise: Promise<T>, timeout?: number): Promise<T> => {
      const timeoutMs = timeout || defaultTimeout;
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
    },
  };
}
