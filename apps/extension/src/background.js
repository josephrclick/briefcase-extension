chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SUMMARIZE") {
    // Placeholder; real impl asks content script for cleaned text and hits a provider.
    sendResponse({ text: "• Key point 1\n• Key point 2\n\nTL;DR: This is a placeholder summary." });
    return true;
  }
});
