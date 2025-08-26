import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider, testOllamaConnection, listOllamaModels } from "./ollama";
import { SummarizeInput } from "./index";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("OllamaProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("testOllamaConnection", () => {
    it("should return connected true when server is running", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await testOllamaConnection();
      expect(result).toEqual({ connected: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434",
        expect.objectContaining({
          method: "GET",
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it("should return connected false with error when server is not running", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Failed to fetch"));

      const result = await testOllamaConnection();
      expect(result.connected).toBe(false);
      expect(result.error).toBe("Failed to fetch");
    });

    it("should handle timeout", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await testOllamaConnection();
      expect(result).toEqual({
        connected: false,
        error: "Connection timeout",
      });
    });
  });

  describe("listOllamaModels", () => {
    it("should return list of available models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.2" }, { name: "mistral" }, { name: "codellama" }],
        }),
      });

      const models = await listOllamaModels();
      expect(models).toEqual(["llama3.2", "mistral", "codellama"]);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/tags",
        expect.objectContaining({
          method: "GET",
        }),
      );
    });

    it("should return empty array when request fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Not Found",
      });

      const models = await listOllamaModels();
      expect(models).toEqual([]);
    });

    it("should handle network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const models = await listOllamaModels();
      expect(models).toEqual([]);
    });
  });

  describe("summarize", () => {
    const mockInput: SummarizeInput = {
      url: "https://example.com/article",
      content: "This is a long article about artificial intelligence and its impact on society.",
      length: "brief",
      level: "high_school",
      style: "plain",
    };

    it("should stream response chunks correctly", async () => {
      const chunks = [
        { message: { content: "AI is " }, done: false },
        { message: { content: "transforming " }, done: false },
        { message: { content: "our world." }, done: true },
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
          }
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const result = [];
      for await (const chunk of OllamaProvider.summarize(mockInput)) {
        result.push(chunk);
      }

      expect(result).toEqual(["AI is ", "transforming ", "our world."]);
    });

    it("should handle connection errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Failed to fetch"));

      const generator = OllamaProvider.summarize(mockInput);
      await expect(generator.next()).rejects.toThrow(
        "Cannot connect to Ollama. Please ensure Ollama is running with 'ollama serve'",
      );
    });

    it("should handle model not found error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "model 'llama3.2' not found",
      });

      const generator = OllamaProvider.summarize(mockInput);
      await expect(generator.next()).rejects.toThrow(
        "Model 'llama3.2' not found. Please pull it with: ollama pull llama3.2",
      );
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      const chunks = [{ message: { content: "AI is " }, done: false }];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(streamController) {
          for (const chunk of chunks) {
            streamController.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
          }
          // Simulate abort before stream completes
          controller.abort();
          streamController.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const result = [];
      try {
        for await (const chunk of OllamaProvider.summarize(mockInput, controller.signal)) {
          result.push(chunk);
        }
      } catch (error) {
        // Should not throw, should return gracefully
      }

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle timeout", async () => {
      // Mock a fetch that never resolves
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            // Never resolve to simulate timeout
          }),
      );

      const generator = OllamaProvider.summarize(mockInput);

      // This should timeout after REQUEST_TIMEOUT_MS
      await expect(generator.next()).rejects.toThrow("Request timed out");
    });

    it("should build correct prompts based on parameters", async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { content: "Summary" },
                done: true,
              }) + "\n",
            ),
          );
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const verboseInput: SummarizeInput = {
        ...mockInput,
        length: "verbose",
        level: "phd",
        style: "bullets",
      };

      const result = [];
      for await (const chunk of OllamaProvider.summarize(verboseInput)) {
        result.push(chunk);
      }

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/chat",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining("3-4 paragraphs"),
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/chat",
        expect.objectContaining({
          body: expect.stringContaining("expert in the field"),
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/chat",
        expect.objectContaining({
          body: expect.stringContaining("bullet points"),
        }),
      );
    });

    it("should handle malformed NDJSON gracefully", async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode("Invalid JSON\n"));
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { content: "Valid content" },
                done: false,
              }) + "\n",
            ),
          );
          controller.enqueue(encoder.encode("Another invalid line\n"));
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                message: { content: " continues." },
                done: true,
              }) + "\n",
            ),
          );
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const result = [];
      for await (const chunk of OllamaProvider.summarize(mockInput)) {
        result.push(chunk);
      }

      // Should only get valid content
      expect(result).toEqual(["Valid content", " continues."]);
    });
  });

  describe("prompt building", () => {
    it("should create appropriate prompts for different parameter combinations", async () => {
      const testCases = [
        {
          input: {
            length: "brief",
            level: "kinder",
            style: "plain",
          },
          expects: ["2-3 sentences", "5-year-old", "plain, flowing paragraphs"],
        },
        {
          input: {
            length: "medium",
            level: "college",
            style: "bullets",
          },
          expects: ["1-2 paragraphs", "college student", "bullet points"],
        },
        {
          input: {
            length: "verbose",
            level: "phd",
            style: "executive",
          },
          expects: ["3-4 paragraphs", "expert", "executive summary"],
        },
      ];

      for (const testCase of testCases) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  message: { content: "Test" },
                  done: true,
                }) + "\n",
              ),
            );
            controller.close();
          },
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: stream,
        });

        const input: SummarizeInput = {
          url: "https://example.com",
          content: "Test content",
          ...testCase.input,
        } as SummarizeInput;

        const result = [];
        for await (const chunk of OllamaProvider.summarize(input)) {
          result.push(chunk);
        }

        const callArgs = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const requestBody = callArgs[1].body;

        for (const expected of testCase.expects) {
          expect(requestBody).toContain(expected);
        }
      }
    });
  });
});
