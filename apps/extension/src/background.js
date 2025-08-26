/* global setTimeout, clearTimeout, fetch, AbortController, TextDecoder */

// TODO: Import from @briefcase/providers when bundling is set up
// For now, defining OllamaProvider inline as a temporary solution
const OllamaProvider = {
  // Configuration - these would come from extension settings in production
  OLLAMA_BASE_URL: "http://localhost:11434",
  OLLAMA_MODEL: "llama3.2",
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds

  /**
   * Build a system prompt based on user parameters
   */
  buildSystemPrompt(params) {
    const lengthMap = {
      brief: "2-3 sentences",
      medium: "1-2 paragraphs",
      verbose: "3-4 paragraphs with comprehensive detail",
    };

    const levelMap = {
      kinder: "a 5-year-old child (use very simple words and short sentences)",
      high_school: "a high school student (clear and accessible language)",
      college: "a college student (sophisticated but clear)",
      phd: "an expert in the field (technical language acceptable)",
    };

    const styleMap = {
      plain: "Write in plain, flowing paragraphs",
      bullets: "Use bullet points for key information",
      executive: "Format as an executive summary with clear sections",
    };

    const length = params?.length || "medium";
    const level = params?.level || "college";
    const style = params?.style || "bullets";

    return `You are an expert content summarizer. Your task is to create a summary of the provided text.

Requirements:
- Length: ${lengthMap[length]}
- Audience: Write for ${levelMap[level]}
- Format: ${styleMap[style]}
- Focus on the main ideas and key takeaways
- Be accurate and faithful to the source material
- Do not include any preamble like "Here is the summary" - start directly with the content`;
  },

  /**
   * Summarize content using Ollama streaming API
   */
  async *summarize(content, params, _signal) {
    const systemPrompt = this.buildSystemPrompt(params);
    const userPrompt = `Please summarize the following content:\n\n${content}`;

    // Prepare the request body
    const requestBody = {
      model: this.OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      options: {
        temperature: 0.7,
        top_p: 0.9,
      },
    };

    // Set up timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    // Use timeout signal (AbortSignal.any() may not be available in all Chrome versions)
    // For now, just use the timeout signal
    const combinedSignal = controller.signal;

    let response;

    try {
      // Make the request to Ollama
      response = await fetch(`${this.OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        // Timeout occurred
        throw new Error("Request timed out. Please try again.");
      }

      // Connection error - likely Ollama not running
      if (error.message.includes("fetch")) {
        throw new Error(
          "Cannot connect to Ollama. Please ensure Ollama is running with 'ollama serve'",
        );
      }

      throw new Error("Failed to connect to Ollama: " + error.message);
    }

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 404 && errorText.includes("model")) {
        throw new Error(
          `Model '${this.OLLAMA_MODEL}' not found. Please pull it with: ollama pull ${this.OLLAMA_MODEL}`,
        );
      }

      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    // Check for response body
    if (!response.body) {
      throw new Error("No response body from Ollama");
    }

    // Set up streaming response handling
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining buffered content
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer);
              if (parsed.message?.content) {
                yield parsed.message.content;
              }
            } catch {
              console.warn("[BG] Failed to parse final buffer:", buffer);
            }
          }
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Split by newlines to process complete JSON objects
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the last potentially incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const parsed = JSON.parse(line);

            // Check if this is the end-of-stream marker
            if (parsed.done === true) {
              // Yield any final content
              if (parsed.message?.content) {
                yield parsed.message.content;
              }
              return;
            }

            // Yield the content chunk
            if (parsed.message?.content) {
              yield parsed.message.content;
            }
          } catch (parseError) {
            console.error("[BG] Failed to parse NDJSON line:", line, parseError);
            // Continue processing other lines
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("[BG] Stream reading aborted");
        return;
      }

      console.error("[BG] Error reading stream:", error);
      throw new Error("Failed to process streaming response from Ollama");
    } finally {
      reader.releaseLock();
    }
  },
};

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

        // Process the content with LLM provider if we have valid content
        if (contentResult?.payload && contentResult.payload.rawText) {
          console.log("[BG] Starting LLM summarization with OllamaProvider");
          console.log("[BG] - Parameters:", msg.params);

          try {
            // Call OllamaProvider.summarize with extracted content and parameters
            const summaryGenerator = OllamaProvider.summarize(
              contentResult.payload.rawText,
              msg.params,
            );

            // Iterate over the summary stream and accumulate chunks
            let fullSummary = "";
            let chunkCount = 0;

            console.log("[BG] Starting to receive summary chunks...");
            for await (const chunk of summaryGenerator) {
              chunkCount++;
              fullSummary += chunk;
              // Log each chunk as it arrives for validation
              console.log(`[BG] Received chunk #${chunkCount}: "${chunk.substring(0, 50)}..."`);
            }

            console.log(`[BG] Summary complete. Total chunks received: ${chunkCount}`);
            console.log(`[BG] Summary length: ${fullSummary.length} characters`);

            // Send the complete summary
            sendResponse({
              text: fullSummary,
              extractedPayload: contentResult.payload,
              metadata: {
                chunksReceived: chunkCount,
                provider: "ollama",
                model: OllamaProvider.OLLAMA_MODEL,
              },
            });
          } catch (llmError) {
            console.error("[BG] LLM summarization failed:", llmError);

            // Send error response with fallback to original content
            sendResponse({
              error: {
                code: "LLM_SUMMARIZATION_FAILED",
                message: llmError.message || "Failed to generate summary",
                details: "The LLM provider encountered an error during summarization",
              },
              extractedPayload: contentResult.payload,
              fallbackText: "Unable to generate summary. Original content available.",
            });
          }
        } else {
          console.warn("[BG] No valid content to summarize");
          sendResponse({
            error: {
              code: "NO_CONTENT_TO_SUMMARIZE",
              message: "No extracted content available for summarization",
              details: "The content extraction may have failed or returned empty",
            },
            extractedPayload: contentResult?.payload || null,
          });
        }
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
