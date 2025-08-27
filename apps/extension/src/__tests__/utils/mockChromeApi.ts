/**
 * Mock Chrome Extension APIs for testing
 */

import { vi } from "vitest";

export interface MockMessage {
  type: string;
  id?: string;
  payload?: unknown;
  timestamp?: number;
}

export interface MockSender {
  id?: string;
  url?: string;
  tab?: {
    id: number;
    url: string;
    title: string;
  };
}

export interface MockSendResponse {
  (response?: unknown): void;
}

class MockMessageListener {
  private listeners: Array<
    (message: MockMessage, sender: MockSender, sendResponse: MockSendResponse) => boolean | void
  > = [];

  addListener(
    callback: (
      message: MockMessage,
      sender: MockSender,
      sendResponse: MockSendResponse,
    ) => boolean | void,
  ) {
    this.listeners.push(callback);
  }

  removeListener(
    callback: (
      message: MockMessage,
      sender: MockSender,
      sendResponse: MockSendResponse,
    ) => boolean | void,
  ) {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  trigger(message: MockMessage, sender: MockSender = {}, sendResponse: MockSendResponse = vi.fn()) {
    this.listeners.forEach((listener) => {
      listener(message, sender, sendResponse);
    });
  }

  clear() {
    this.listeners = [];
  }
}

class MockChromeRuntime {
  onMessage = new MockMessageListener();
  lastError: { message: string } | null = null;

  sendMessage = vi.fn((_message: MockMessage, callback?: (response: unknown) => void) => {
    if (callback) {
      callback({ success: true });
    }
    return Promise.resolve({ success: true });
  });

  getURL = vi.fn((path: string) => `chrome-extension://mock-id/${path}`);
}

class MockChromeOffscreen {
  createDocument = vi.fn(
    async (_options: { url: string; reasons: string[]; justification: string }) => {
      return Promise.resolve();
    },
  );

  closeDocument = vi.fn(async () => {
    return Promise.resolve();
  });

  hasDocument = vi.fn(async () => {
    return Promise.resolve(false);
  });
}

class MockChromeStorage {
  local = {
    get: vi.fn(async (_keys: string | string[]) => {
      return {};
    }),
    set: vi.fn(async (_items: Record<string, unknown>) => {
      return;
    }),
    remove: vi.fn(async (_keys: string | string[]) => {
      return;
    }),
    clear: vi.fn(async () => {
      return;
    }),
  };

  sync = {
    get: vi.fn(async (_keys: string | string[]) => {
      return {};
    }),
    set: vi.fn(async (_items: Record<string, unknown>) => {
      return;
    }),
    remove: vi.fn(async (_keys: string | string[]) => {
      return;
    }),
    clear: vi.fn(async () => {
      return;
    }),
  };
}

class MockChromeSidePanel {
  open = vi.fn(async (_options?: { tabId?: number; windowId?: number }) => {
    return Promise.resolve();
  });

  setOptions = vi.fn(async (_options: { tabId?: number; enabled?: boolean; path?: string }) => {
    return Promise.resolve();
  });

  getOptions = vi.fn(async (_options: { tabId?: number }) => {
    return Promise.resolve({ enabled: true, path: "/sidepanel.html" });
  });
}

export class MockChromeApi {
  runtime = new MockChromeRuntime();
  offscreen = new MockChromeOffscreen();
  storage = new MockChromeStorage();
  sidePanel = new MockChromeSidePanel();

  reset() {
    this.runtime.onMessage.clear();
    this.runtime.sendMessage.mockClear();
    this.runtime.getURL.mockClear();
    this.runtime.lastError = null;

    this.offscreen.createDocument.mockClear();
    this.offscreen.closeDocument.mockClear();
    this.offscreen.hasDocument.mockClear();

    this.storage.local.get.mockClear();
    this.storage.local.set.mockClear();
    this.storage.local.remove.mockClear();
    this.storage.local.clear.mockClear();

    this.storage.sync.get.mockClear();
    this.storage.sync.set.mockClear();
    this.storage.sync.remove.mockClear();
    this.storage.sync.clear.mockClear();

    this.sidePanel.open.mockClear();
    this.sidePanel.setOptions.mockClear();
    this.sidePanel.getOptions.mockClear();
  }
}

export function setupChromeMock() {
  const mockChrome = new MockChromeApi();

  // @ts-expect-error - Mock Chrome API
  global.chrome = mockChrome;

  return mockChrome;
}

export function cleanupChromeMock() {
  // @ts-expect-error - Clean up mock Chrome API
  delete global.chrome;
}
