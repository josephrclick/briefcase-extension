import { LLMProvider, SummarizeInput } from "./index";
export const OpenAIProvider: LLMProvider = {
  id: "openai:gpt-4o-mini",
  supportsStreaming: true,
  async *summarize(input: SummarizeInput) {
    yield "• Key points will stream here...";
    yield "\nTL;DR: ...";
  },
};
