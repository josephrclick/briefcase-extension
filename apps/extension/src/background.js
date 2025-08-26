/* global setTimeout */

// Handle action button click to open side panel
chrome.action.onClicked.addListener(async (tab) => {
  // Open the side panel for the current window
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Set up side panel behavior
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    enabled: true,
  });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Handle messages from content script and panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SUMMARIZE") {
    // Handle SUMMARIZE message from the panel
    (async () => {
      try {
        console.log("[BG] SUMMARIZE message received with params:", msg.params);

        // Get the active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!activeTab?.id) {
          console.warn("[BG] No active tab found");
          sendResponse({
            error: {
              code: "NO_ACTIVE_TAB",
              message: "No active tab found",
              details: "Please ensure a tab is active before summarizing",
            },
          });
          return;
        }

        // Send GET_CONTENT message to the content script
        console.log("[BG] Sending GET_CONTENT to tab:", activeTab.id);

        // Add timeout to prevent hanging requests
        const MESSAGE_TIMEOUT_MS = 5000;

        const contentResult = await Promise.race([
          // Message promise
          new Promise((resolve) => {
            chrome.tabs.sendMessage(activeTab.id, { type: "GET_CONTENT" }, (response) => {
              if (chrome.runtime.lastError) {
                const errorMessage = chrome.runtime.lastError.message;
                console.warn("[BG] Error sending message to content script:", errorMessage);
                // Include error details in the response
                resolve({
                  type: "CONTENT_RESULT",
                  payload: null,
                  error: {
                    code: "CONTENT_SCRIPT_ERROR",
                    message: errorMessage,
                    details: "Content script may not be injected or available",
                  },
                });
                return;
              }
              resolve(response);
            });
          }),
          // Timeout promise
          new Promise((resolve) => {
            setTimeout(() => {
              console.warn("[BG] Message timeout after", MESSAGE_TIMEOUT_MS, "ms");
              resolve({
                type: "CONTENT_RESULT",
                payload: null,
                error: {
                  code: "MESSAGE_TIMEOUT",
                  message: `Content script did not respond within ${MESSAGE_TIMEOUT_MS}ms`,
                  details: "The content script may be busy or unresponsive",
                },
              });
            }, MESSAGE_TIMEOUT_MS);
          }),
        ]);

        // Log the extracted content payload for validation
        console.log("[BG] CONTENT_RESULT received from content script:");
        console.log("[BG] - Payload received:", contentResult?.payload ? "yes" : "no");
        if (contentResult?.payload) {
          console.log("[BG] - Title:", contentResult.payload.title);
          console.log("[BG] - URL:", contentResult.payload.url);
          console.log("[BG] - Word count:", contentResult.payload.wordCount);
          console.log("[BG] - Sections count:", contentResult.payload.sections?.length || 0);
          if (contentResult.payload.extractionMetrics) {
            console.log(
              "[BG] - Extraction time:",
              contentResult.payload.extractionMetrics.timeMs + "ms",
            );
            console.log(
              "[BG] - Content truncated:",
              contentResult.payload.extractionMetrics.truncated,
            );
          }
        }
        if (contentResult?.error) {
          console.log("[BG] - Error:", contentResult.error.code, "-", contentResult.error.message);
        }

        // TODO: Process the content with LLM provider using msg.params and contentResult.payload
        // For now, return a placeholder summary with the extracted content for testing
        sendResponse({
          text: "• Key point 1\n• Key point 2\n\nTL;DR: This is a placeholder summary.",
          extractedPayload: contentResult?.payload || null,
        });
      } catch (error) {
        console.error("[BG] Error handling SUMMARIZE message:", error);
        sendResponse({
          error: {
            code: "SUMMARIZE_FAILED",
            message: error.message || "Failed to process summarize request",
            details: "An unexpected error occurred during summarization",
          },
        });
      }
    })();

    // Keep the message channel open for async response
    return true;
  }
});
