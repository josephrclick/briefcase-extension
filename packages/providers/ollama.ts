import { LLMProvider, SummarizeInput } from "./index";
export const OllamaProvider: LLMProvider = {
  id: "local:ollama:llama3",
  supportsStreaming: true,
  async *summarize(input: SummarizeInput) {
    yield "• (local) Key points...";
    yield "\nTL;DR: ...";
  },
};
