/* global performance */

(() => {
  console.debug("Briefcase content script loaded.");

  // TODO: Import from @briefcase/extractor when bundling is set up
  // For now, defining extractFromDom inline as a temporary solution
  function extractFromDom(doc) {
    try {
      const startTime = performance.now();

      // Simple extraction without Readability for now
      // This is a temporary implementation until proper bundling is configured
      // TODO: Replace with proper import from @briefcase/extractor package

      // Extract basic content from the page
      const title = doc.title || "";
      const url = doc.location?.href || "";
      const site = doc.location?.hostname || "";

      // Get main content areas with fallback prioritization:
      // 1. <article> - Most semantic for blog posts and articles
      // 2. <main> - Common main content container
      // 3. <body> - Last resort fallback for unusual page structures
      const article = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      const paragraphs = Array.from(article.querySelectorAll("p"));

      // Extract text content with length limits
      const MAX_TEXT_LENGTH = 500000; // ~500KB text limit
      const MAX_SECTIONS = 1000; // Limit number of sections to prevent memory issues

      let textContent = paragraphs
        .map((p) => p.textContent?.trim())
        .filter(Boolean)
        .join("\n\n");

      // Apply content length limit
      if (textContent.length > MAX_TEXT_LENGTH) {
        console.warn(
          `[CS] Content truncated from ${textContent.length} to ${MAX_TEXT_LENGTH} chars`,
        );
        textContent = textContent.substring(0, MAX_TEXT_LENGTH) + "...";
      }

      // Create sections from paragraphs with limit
      const sections = paragraphs
        .slice(0, MAX_SECTIONS)
        .map((p, i) => ({
          id: `p${i}`,
          text: p.textContent?.trim() || "",
        }))
        .filter((section) => section.text.length > 0);

      if (paragraphs.length > MAX_SECTIONS) {
        console.warn(`[CS] Sections limited from ${paragraphs.length} to ${MAX_SECTIONS}`);
      }

      // Calculate word count
      const wordCount = textContent.split(/\s+/).filter(Boolean).length;

      // Return null if no meaningful content found
      if (wordCount < 10) {
        console.log("[CS] Extraction skipped - insufficient content (< 10 words)");
        return null;
      }

      // Calculate extraction time
      const extractionTime = performance.now() - startTime;

      const result = {
        url: url,
        title: title,
        site: site,
        rawText: textContent,
        sections: sections,
        wordCount: wordCount,
        // Add extraction metrics
        extractionMetrics: {
          timeMs: Math.round(extractionTime),
          paragraphsFound: paragraphs.length,
          sectionsExtracted: sections.length,
          truncated: textContent.length >= MAX_TEXT_LENGTH || paragraphs.length > MAX_SECTIONS,
        },
      };

      console.log(`[CS] Extraction successful in ${Math.round(extractionTime)}ms`);
      return result;
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
          if (extractedPayload.extractionMetrics) {
            console.log(
              "[CS] - Extraction time:",
              extractedPayload.extractionMetrics.timeMs + "ms",
            );
            console.log("[CS] - Truncated:", extractedPayload.extractionMetrics.truncated);
          }
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
