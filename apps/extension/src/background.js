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
          sendResponse({ error: "NO_ACTIVE_TAB" });
          return;
        }

        // Send GET_CONTENT message to the content script
        console.log("[BG] Sending GET_CONTENT to tab:", activeTab.id);

        const contentResult = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(activeTab.id, { type: "GET_CONTENT" }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[BG] Error sending message to content script:",
                chrome.runtime.lastError.message,
              );
              // Return null payload if content script isn't available
              resolve({ type: "CONTENT_RESULT", payload: null });
              return;
            }
            resolve(response);
          });
        });

        // Log the extracted content payload for validation
        console.log("[BG] CONTENT_RESULT received from content script:");
        console.log("[BG] - Payload received:", contentResult?.payload ? "yes" : "no");
        if (contentResult?.payload) {
          console.log("[BG] - Title:", contentResult.payload.title);
          console.log("[BG] - URL:", contentResult.payload.url);
          console.log("[BG] - Word count:", contentResult.payload.wordCount);
          console.log("[BG] - Sections count:", contentResult.payload.sections?.length || 0);
        }

        // TODO: Process the content with LLM provider using msg.params and contentResult.payload
        // For now, return a placeholder summary with the extracted content for testing
        sendResponse({
          text: "• Key point 1\n• Key point 2\n\nTL;DR: This is a placeholder summary.",
          extractedPayload: contentResult?.payload || null,
        });
      } catch (error) {
        console.error("[BG] Error handling SUMMARIZE message:", error);
        sendResponse({ error: "SUMMARIZE_FAILED" });
      }
    })();

    // Keep the message channel open for async response
    return true;
  }
});
