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
    // Placeholder; real impl asks content script for cleaned text and hits a provider.
    sendResponse({ text: "• Key point 1\n• Key point 2\n\nTL;DR: This is a placeholder summary." });
    return true;
  }
});
