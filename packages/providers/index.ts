export interface SummarizeInput {
  url: string;
  content: string;
  length: "brief" | "medium" | "verbose";
  level: "kinder" | "high_school" | "college" | "phd";
  style: "plain" | "bullets" | "executive";
}
export interface LLMProvider {
  id: string;
  supportsStreaming: boolean;
  summarize(input: SummarizeInput, signal?: AbortSignal): AsyncIterable<string> | Promise<string>;
}
