/**
 * Background service worker for Chrome Extension
 * Coordinates communication between UI components and offscreen document
 * Handles content script injection, summarization, and database operations
 */

import { getOffscreenProxy } from "./background/offscreenProxy";
import {
  MessageRouter,
  createSuccessResponse,
  createErrorResponse,
  generateMessageId,
} from "./types/messages";
import { MessageType } from "./offscreen/offscreen";
import {
  DbSearchRequest,
  DbDeleteAllRequest,
  DbGetHistoryRequest,
  DbExportDocumentsRequest,
  DbCancelExportRequest,
  DbExportProgress,
  DbExportChunk,
} from "./types/database";
import { createExtendedError, errorLogger } from "./types/errors";
import { DbErrorCode } from "./types/database";

// Initialize components
const offscreenProxy = getOffscreenProxy();
const messageRouter = new MessageRouter();

// Port connections for streaming to UI
const portConnections = new Map<string, chrome.runtime.Port>();

/**
 * Initialize the service worker
 */
async function initialize(): Promise<void> {
  console.log("[ServiceWorker] Initializing...");

  try {
    // Initialize offscreen document and database
    await offscreenProxy.initializeDatabase();
    console.log("[ServiceWorker] Database initialized");

    // Setup message routing
    setupMessageRouting();

    // Setup port connections for streaming
    setupPortConnections();

    // Setup extension action handler
    setupExtensionAction();

    // Setup context menus (optional)
    setupContextMenus();

    console.log("[ServiceWorker] Initialization complete");
  } catch (error) {
    console.error("[ServiceWorker] Initialization failed:", error);
    errorLogger.log(error);
  }
}

/**
 * Setup message routing for all message types
 */
function setupMessageRouting(): void {
  // Database search
  messageRouter.register<DbSearchRequest["payload"]>(MessageType.DB_SEARCH, async (message) => {
    try {
      const result = await offscreenProxy.searchDatabase(message.payload!.query, message.payload);
      return createSuccessResponse(message, result);
    } catch (error) {
      errorLogger.log(error);
      return createErrorResponse(message, error);
    }
  });

  // Delete all data
  messageRouter.register<DbDeleteAllRequest["payload"]>(
    MessageType.DB_DELETE_ALL_DATA,
    async (message) => {
      try {
        const result = await offscreenProxy.deleteAllData(message.payload?.confirm || false);
        return createSuccessResponse(message, result);
      } catch (error) {
        errorLogger.log(error);
        return createErrorResponse(message, error);
      }
    },
  );

  // Get history
  messageRouter.register<DbGetHistoryRequest["payload"]>(
    MessageType.DB_GET_HISTORY,
    async (message) => {
      try {
        const result = await offscreenProxy.getHistory(message.payload);
        return createSuccessResponse(message, result);
      } catch (error) {
        errorLogger.log(error);
        return createErrorResponse(message, error);
      }
    },
  );

  // Export documents (with streaming)
  messageRouter.register<DbExportDocumentsRequest["payload"]>(
    MessageType.DB_EXPORT_DOCUMENTS,
    async (message, sender) => {
      try {
        const { format, filters, options, exportId } = message.payload!;
        const streamId = exportId || generateMessageId("export");

        // Find the port connection for the sender
        const port = findPortForSender(sender);

        // Setup stream handlers
        const progressHandler = (progress: DbExportProgress) => {
          if (port) {
            port.postMessage(progress);
          } else {
            // Send via regular message
            chrome.runtime.sendMessage(progress).catch(() => {});
          }
        };

        const chunkHandler = (chunk: DbExportChunk) => {
          if (port) {
            port.postMessage(chunk);
          } else {
            // Send via regular message
            chrome.runtime.sendMessage(chunk).catch(() => {});
          }
        };

        // Start export
        const exportData = await offscreenProxy.exportDocuments(
          format,
          {
            filters,
            ...options,
          },
          progressHandler,
          chunkHandler,
        );

        return createSuccessResponse(message, { exportId: streamId, data: exportData });
      } catch (error) {
        errorLogger.log(error);
        return createErrorResponse(message, error);
      }
    },
  );

  // Cancel export
  messageRouter.register<DbCancelExportRequest["payload"]>(
    MessageType.DB_CANCEL_EXPORT,
    async (message) => {
      try {
        await offscreenProxy.cancelExport(message.payload!.exportId, message.payload?.reason);
        return createSuccessResponse(message);
      } catch (error) {
        errorLogger.log(error);
        return createErrorResponse(message, error);
      }
    },
  );

  // Content extraction from current tab
  messageRouter.register("EXTRACT_CONTENT", async (message) => {
    try {
      const tab = await getCurrentTab();
      if (!tab || !tab.id) {
        throw createExtendedError(DbErrorCode.INVALID_REQUEST, "No active tab found");
      }

      // Inject content script if needed
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/contentScript.js"],
      });

      // Get content from the tab
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_PAGE_CONTENT",
      });

      return createSuccessResponse(message, response);
    } catch (error) {
      errorLogger.log(error);
      return createErrorResponse(message, error);
    }
  });

  // Summarization request (would integrate with LLM providers)
  messageRouter.register("SUMMARIZE", async (message) => {
    try {
      // This would integrate with the LLM provider system
      // For now, return a mock response
      return createSuccessResponse(message, {
        summary: "This feature will be implemented with LLM provider integration",
      });
    } catch (error) {
      errorLogger.log(error);
      return createErrorResponse(message, error);
    }
  });

  // Listen for messages
  messageRouter.listen();
}

/**
 * Setup port connections for streaming
 */
function setupPortConnections(): void {
  chrome.runtime.onConnect.addListener((port) => {
    console.log(`[ServiceWorker] Port connected: ${port.name}`);

    // Store port connection
    const connectionId = generateMessageId("port");
    portConnections.set(connectionId, port);

    // Handle port messages
    port.onMessage.addListener(async (message) => {
      try {
        // Route message through the message router
        const response = await messageRouter.route(message, {
          id: connectionId,
          url: port.sender?.url,
          tab: port.sender?.tab,
        } as chrome.runtime.MessageSender);

        // Send response back through port
        port.postMessage(response);
      } catch (error) {
        console.error("[ServiceWorker] Port message error:", error);
        port.postMessage(createErrorResponse(message, error));
      }
    });

    // Handle port disconnect
    port.onDisconnect.addListener(() => {
      console.log(`[ServiceWorker] Port disconnected: ${port.name}`);
      portConnections.delete(connectionId);
    });
  });
}

/**
 * Find port connection for a specific sender
 */
function findPortForSender(sender?: chrome.runtime.MessageSender): chrome.runtime.Port | undefined {
  if (!sender?.id) return undefined;

  for (const [, port] of portConnections) {
    if (port.sender?.tab?.id === sender.tab?.id || port.sender?.id === sender.id) {
      return port;
    }
  }

  return undefined;
}

/**
 * Setup extension action (toolbar button)
 */
function setupExtensionAction(): void {
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      // Open side panel
      if (chrome.sidePanel && tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } else {
        // Fallback to popup or new tab
        await chrome.windows.create({
          url: chrome.runtime.getURL("src/sidepanel/index.html"),
          type: "popup",
          width: 400,
          height: 600,
        });
      }
    } catch (error) {
      console.error("[ServiceWorker] Failed to open side panel:", error);
      errorLogger.log(error);
    }
  });
}

/**
 * Setup context menus for additional functionality
 */
function setupContextMenus(): void {
  chrome.runtime.onInstalled.addListener(() => {
    // Create context menu for text selection
    chrome.contextMenus.create({
      id: "summarize-selection",
      title: "Summarize with Briefcase",
      contexts: ["selection"],
    });

    // Create context menu for page
    chrome.contextMenus.create({
      id: "summarize-page",
      title: "Summarize this page",
      contexts: ["page"],
    });
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    try {
      if (!tab?.id) return;

      switch (info.menuItemId) {
        case "summarize-selection":
          // Send selected text to side panel for summarization
          await sendToSidePanel({
            type: "SUMMARIZE_SELECTION",
            text: info.selectionText,
          });
          break;

        case "summarize-page":
          // Extract and summarize entire page
          await sendToSidePanel({
            type: "SUMMARIZE_PAGE",
            tabId: tab.id,
          });
          break;
      }
    } catch (error) {
      console.error("[ServiceWorker] Context menu error:", error);
      errorLogger.log(error);
    }
  });
}

/**
 * Send message to side panel
 */
async function sendToSidePanel(message: Record<string, unknown>): Promise<void> {
  // Try to open side panel first
  const window = await chrome.windows.getCurrent();
  if (chrome.sidePanel && window.id) {
    await chrome.sidePanel.open({ windowId: window.id });
  }

  // Send message to all connected ports (side panel should be one of them)
  for (const port of portConnections.values()) {
    if (port.name === "sidepanel") {
      port.postMessage(message);
    }
  }

  // Also try sending via regular message
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel might not be ready yet
  });
}

/**
 * Get current active tab
 */
async function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Handle extension installation or update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[ServiceWorker] Extension installed/updated:", details.reason);

  if (details.reason === "install") {
    // First installation
    await initialize();

    // Open welcome page
    await chrome.tabs.create({
      url: chrome.runtime.getURL("src/welcome.html"),
    });
  } else if (details.reason === "update") {
    // Extension updated
    await initialize();
  }
});

/**
 * Handle service worker activation
 */
self.addEventListener("activate", async () => {
  console.log("[ServiceWorker] Activated");
  await initialize();
});

/**
 * Keep service worker alive (for development)
 */
if (process.env.NODE_ENV === "development") {
  setInterval(() => {
    // Ping to keep alive
    chrome.runtime.getPlatformInfo(() => {});
  }, 20000); // Every 20 seconds
}

// Export for testing
export { messageRouter, offscreenProxy };
