export interface ExtractedDoc {
  url: string;
  title: string;
  site?: string;
  rawText: string;
  meta: { wordCount: number; extractedAt: string; hash: string };
}
export interface SaveResult {
  documentId: string;
}
export interface DAL {
  upsertDocument(doc: ExtractedDoc): Promise<SaveResult>;
  saveSummary(input: {
    documentId: string;
    model: string;
    params: any;
    savedPath: string;
    savedFormat: "md" | "txt";
  }): Promise<void>;
  recordABRun(run: {
    documentId: string;
    modelA: string;
    modelB: string;
    template: string;
  }): Promise<{ runId: string }>;
  recordABScore(score: {
    runId: string;
    coverage: boolean;
    readability: boolean;
    faithfulness: boolean;
    note?: string;
  }): Promise<void>;
  search(
    query: string,
  ): Promise<{ documentId: string; title: string; url: string; snippet: string }[]>;
}
