/* global setTimeout, clearTimeout, fetch, AbortController, TextDecoder */

// Default settings - can be overridden via chrome.storage.sync
const DEFAULT_SETTINGS = {
  OLLAMA_BASE_URL: "http://localhost:11434",
  OLLAMA_MODEL: "llama3.2",
  REQUEST_TIMEOUT_MS: 30000, // 30 seconds
  MESSAGE_TIMEOUT_MS: 10000, // 10 seconds (increased from 5)
  MAX_CONTENT_LENGTH: 100000, // 100K characters max
};

// Settings management
let currentSettings = { ...DEFAULT_SETTINGS };

// Load settings from chrome.storage
async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get("ollamaSettings");
    if (stored.ollamaSettings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...stored.ollamaSettings };
    }
  } catch (error) {
    console.warn("[BG] Failed to load settings, using defaults", error.message);
  }
  return currentSettings;
}

// Initialize settings on startup
loadSettings();

// Input validation helper
function validateSummarizeInput(content, params) {
  const errors = [];

  // Validate content
  if (!content || typeof content !== "string") {
    errors.push("Content must be a non-empty string");
  } else if (content.length > currentSettings.MAX_CONTENT_LENGTH) {
    errors.push(
      `Content exceeds maximum length of ${currentSettings.MAX_CONTENT_LENGTH} characters`,
    );
  }

  // Validate parameters
  if (params) {
    const validLengths = ["brief", "medium", "verbose"];
    const validLevels = ["kinder", "high_school", "college", "phd"];
    const validStyles = ["plain", "bullets", "executive"];

    if (params.length && !validLengths.includes(params.length)) {
      errors.push(`Invalid length parameter: ${params.length}`);
    }
    if (params.level && !validLevels.includes(params.level)) {
      errors.push(`Invalid level parameter: ${params.level}`);
    }
    if (params.style && !validStyles.includes(params.style)) {
      errors.push(`Invalid style parameter: ${params.style}`);
    }
  }

  return errors.length > 0 ? errors : null;
}

// Error sanitization helper
function sanitizeError(error) {
  // Remove stack traces and sensitive info
  const message = error.message || "An error occurred";

  // Only log full error in development (you could check a debug flag)
  if (currentSettings.DEBUG_MODE) {
    console.error("[BG] Full error:", error);
  }

  // Return sanitized message for UI
  return {
    message: message.substring(0, 200), // Limit message length
    code: error.code || "UNKNOWN_ERROR",
  };
}

// TODO: Import from @briefcase/providers when bundling is set up
// For now, defining OllamaProvider inline as a temporary solution
const OllamaProvider = {
  // Use settings from currentSettings object

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
    // Validate input before processing
    const validationErrors = validateSummarizeInput(content, params);
    if (validationErrors) {
      throw new Error(`Input validation failed: ${validationErrors.join(", ")}`);
    }

    const systemPrompt = this.buildSystemPrompt(params);
    const userPrompt = `Please summarize the following content:\n\n${content}`;

    // Prepare the request body
    const requestBody = {
      model: currentSettings.OLLAMA_MODEL,
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
    const timeoutId = setTimeout(() => controller.abort(), currentSettings.REQUEST_TIMEOUT_MS);

    // Use timeout signal (AbortSignal.any() may not be available in all Chrome versions)
    // For now, just use the timeout signal
    const combinedSignal = controller.signal;

    let response;

    try {
      // Make the request to Ollama
      response = await fetch(`${currentSettings.OLLAMA_BASE_URL}/api/chat`, {
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
          `Model '${currentSettings.OLLAMA_MODEL}' not found. Please pull it with: ollama pull ${currentSettings.OLLAMA_MODEL}`,
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
          } catch {
            console.warn("[BG] Failed to parse NDJSON line");
            // Continue processing other lines without exposing details
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("[BG] Stream reading aborted");
        return;
      }

      console.warn("[BG] Error reading stream", error.message);
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

// Clean up offscreen document on extension update/uninstall
chrome.runtime.onSuspend.addListener(async () => {
  console.log("[BG] Extension suspending, cleaning up offscreen document...");
  try {
    // Check if offscreen document exists and close it
    const offscreenUrl = chrome.runtime.getURL("src/offscreen/offscreen.html");
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });

    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
      console.log("[BG] Offscreen document closed successfully");
    }
  } catch (error) {
    console.error("[BG] Error cleaning up offscreen document:", error);
  }
});

// Also clean up on update/restart
chrome.runtime.onUpdateAvailable.addListener(async (details) => {
  console.log("[BG] Extension update available:", details.version);
  try {
    // Close offscreen document before update
    await chrome.offscreen.closeDocument();
  } catch (error) {
    // Document might not exist, that's okay
    console.debug("[BG] Offscreen document cleanup on update:", error.message);
  }
  // Allow the update to proceed
  chrome.runtime.reload();
});

// Handle messages from content script and panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "SUMMARIZE") {
    // Handle SUMMARIZE message from the panel
    // Return a Promise to properly handle async operations
    const handleSummarize = async () => {
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
        const MESSAGE_TIMEOUT_MS = currentSettings.MESSAGE_TIMEOUT_MS;

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

          // Generate a unique request ID to correlate chunks with this request
          const requestId = `summary-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          console.log("[BG] Generated request ID:", requestId);

          try {
            // Send initial acknowledgment that streaming will begin
            sendResponse({
              status: "streaming",
              requestId: requestId,
              extractedPayload: contentResult.payload,
            });

            // Call OllamaProvider.summarize with extracted content and parameters
            const summaryGenerator = OllamaProvider.summarize(
              contentResult.payload.rawText,
              msg.params,
            );

            // Stream chunks to the panel
            let chunkCount = 0;
            let totalLength = 0;

            console.log("[BG] Starting to stream summary chunks...");
            for await (const chunk of summaryGenerator) {
              chunkCount++;
              totalLength += chunk.length;

              // Send chunk to panel via broadcast message
              chrome.runtime.sendMessage({
                type: "SUMMARY_CHUNK",
                payload: chunk,
                requestId: requestId,
              });

              // Log progress for validation
              console.log(`[BG] Streamed chunk #${chunkCount}: "${chunk.substring(0, 50)}..."`);
            }

            console.log(`[BG] Streaming complete. Total chunks sent: ${chunkCount}`);
            console.log(`[BG] Total summary length: ${totalLength} characters`);

            // Send completion signal
            chrome.runtime.sendMessage({
              type: "SUMMARY_COMPLETE",
              requestId: requestId,
              metadata: {
                chunksReceived: chunkCount,
                totalLength: totalLength,
                provider: "ollama",
                model: currentSettings.OLLAMA_MODEL,
              },
            });
          } catch (llmError) {
            const sanitized = sanitizeError(llmError);
            console.warn("[BG] LLM summarization failed:", sanitized.message);

            // Send error via broadcast message to panel
            chrome.runtime.sendMessage({
              type: "SUMMARY_ERROR",
              requestId: requestId,
              error: {
                code: sanitized.code || "LLM_SUMMARIZATION_FAILED",
                message: sanitized.message,
                details: "The LLM provider encountered an error during summarization",
              },
            });
          }
        } else {
          console.warn("[BG] No valid content to summarize");

          // Generate a request ID even for error case for consistency
          const requestId = `summary-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          sendResponse({
            status: "error",
            requestId: requestId,
            error: {
              code: "NO_CONTENT_TO_SUMMARIZE",
              message: "No extracted content available for summarization",
              details: "The content extraction may have failed or returned empty",
            },
            extractedPayload: contentResult?.payload || null,
          });
        }
      } catch (error) {
        const sanitized = sanitizeError(error);
        console.warn("[BG] Error handling SUMMARIZE message:", sanitized.message);
        return {
          error: {
            code: sanitized.code || "SUMMARIZE_FAILED",
            message: sanitized.message,
            details: "An unexpected error occurred during summarization",
          },
        };
      }
    };

    // Execute the async handler and return the Promise
    // This ensures proper message channel handling
    handleSummarize()
      .then(sendResponse)
      .catch((error) => {
        const sanitized = sanitizeError(error);
        sendResponse({
          error: {
            code: sanitized.code || "HANDLER_ERROR",
            message: sanitized.message,
            details: "Failed to handle message",
          },
        });
      });

    // Return true to indicate async response
    return true;
  }
});
