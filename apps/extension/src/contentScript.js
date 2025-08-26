(() => {
  console.debug("Briefcase content script loaded.");

  // TODO: Import from @briefcase/extractor when bundling is set up
  // For now, defining extractFromDom inline as a temporary solution
  function extractFromDom(doc) {
    try {
      // Simple extraction without Readability for now
      // This is a temporary implementation until proper bundling is configured
      // TODO: Replace with proper import from @briefcase/extractor package

      // Extract basic content from the page
      const title = doc.title || "";
      const url = doc.location?.href || "";
      const site = doc.location?.hostname || "";

      // Get main content areas
      const article = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      const paragraphs = Array.from(article.querySelectorAll("p"));

      // Extract text content
      const textContent = paragraphs
        .map((p) => p.textContent?.trim())
        .filter(Boolean)
        .join("\n\n");

      // Create sections from paragraphs
      const sections = paragraphs
        .map((p, i) => ({
          id: `p${i}`,
          text: p.textContent?.trim() || "",
        }))
        .filter((section) => section.text.length > 0);

      // Calculate word count
      const wordCount = textContent.split(/\s+/).filter(Boolean).length;

      // Return null if no meaningful content found
      if (wordCount < 10) {
        return null;
      }

      return {
        url: url,
        title: title,
        site: site,
        rawText: textContent,
        sections: sections,
        wordCount: wordCount,
      };
    } catch (error) {
      console.error("[CS] Extraction failed:", error);
      return null;
    }
  }

  // Message handler for GET_CONTENT requests from background script
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "GET_CONTENT") {
      console.log("[CS] GET_CONTENT message received from background script");

      try {
        // Extract content from the current page
        console.log("[CS] Starting content extraction...");
        const extractedPayload = extractFromDom(document);

        if (extractedPayload) {
          console.log("[CS] Content extraction successful:");
          console.log("[CS] - Title:", extractedPayload.title);
          console.log("[CS] - URL:", extractedPayload.url);
          console.log("[CS] - Word count:", extractedPayload.wordCount);
          console.log("[CS] - Sections extracted:", extractedPayload.sections?.length || 0);
        } else {
          console.log("[CS] Content extraction returned null (no suitable content found)");
        }

        // Send the extracted content back to the background script
        sendResponse({
          type: "CONTENT_RESULT",
          payload: extractedPayload,
        });
      } catch (error) {
        console.error("[CS] Error during content extraction:", error);
        sendResponse({
          type: "CONTENT_RESULT",
          payload: null,
        });
      }

      // Keep the message channel open for async response (though we're responding synchronously here)
      return true;
    }
  });
})();
