import { LLMProvider, SummarizeInput } from "./index";

// Configuration - these would come from extension settings in production
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Build a system prompt based on user parameters
 */
function buildSystemPrompt(input: SummarizeInput): string {
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

  return `You are an expert content summarizer. Your task is to create a summary of the provided text.

Requirements:
- Length: ${lengthMap[input.length]}
- Audience: Write for ${levelMap[input.level]}
- Format: ${styleMap[input.style]}
- Focus on the main ideas and key takeaways
- Be accurate and faithful to the source material
- Do not include any preamble like "Here is the summary" - start directly with the content

Source URL: ${input.url}`;
}

/**
 * Build the user prompt with the content to summarize
 */
function buildUserPrompt(content: string, focus?: string): string {
  const prompt = `Please summarize the following content:\n\n${content}`;
  if (focus) {
    return `${prompt}\n\nSpecial focus: ${focus}`;
  }
  return prompt;
}

/**
 * Test connection to Ollama server
 */
export async function testOllamaConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(OLLAMA_BASE_URL, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { connected: true };
    }
    return { connected: false, error: `Server returned status ${response.status}` };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { connected: false, error: "Connection timeout" };
      }
      return { connected: false, error: error.message };
    }
    return { connected: false, error: "Unknown error" };
  }
}

/**
 * List available models from Ollama
 */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
    });

    if (!response.ok) {
      console.error("Failed to list models:", response.statusText);
      return [];
    }

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    return data.models?.map((model) => model.name) || [];
  } catch (error) {
    console.error("Error listing Ollama models:", error);
    return [];
  }
}

/**
 * Ollama Provider implementation
 */
export const OllamaProvider: LLMProvider = {
  id: `local:ollama:${OLLAMA_MODEL}`,
  supportsStreaming: true,

  async *summarize(input: SummarizeInput, signal?: AbortSignal) {
    // Build the prompts
    const systemPrompt = buildSystemPrompt(input);
    const userPrompt = buildUserPrompt(input.content);

    // Prepare the request body
    const requestBody = {
      model: OLLAMA_MODEL,
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
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    // Combine user signal with timeout signal
    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    let response: Response;

    try {
      // Make the request to Ollama
      response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          if (signal?.aborted) {
            // User cancelled the request
            console.log("Summarization cancelled by user");
            return;
          } else {
            // Timeout occurred
            throw new Error("Request timed out. Please try again.");
          }
        }

        // Connection error - likely Ollama not running
        if (error.message.includes("fetch")) {
          throw new Error(
            "Cannot connect to Ollama. Please ensure Ollama is running with 'ollama serve'",
          );
        }
      }

      throw new Error("Failed to connect to Ollama");
    }

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 404 && errorText.includes("model")) {
        throw new Error(
          `Model '${OLLAMA_MODEL}' not found. Please pull it with: ollama pull ${OLLAMA_MODEL}`,
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
              console.warn("Failed to parse final buffer:", buffer);
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
            console.error("Failed to parse NDJSON line:", line, parseError);
            // Continue processing other lines
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Stream reading aborted");
        return;
      }

      console.error("Error reading stream:", error);
      throw new Error("Failed to process streaming response from Ollama");
    } finally {
      reader.releaseLock();
    }
  },
};

// Export helper functions for use in settings UI
export const ollamaHelpers = {
  testConnection: testOllamaConnection,
  listModels: listOllamaModels,
  getCurrentModel: () => OLLAMA_MODEL,
  getBaseUrl: () => OLLAMA_BASE_URL,
};
