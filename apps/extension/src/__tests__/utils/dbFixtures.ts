/**
 * Database fixtures and test data for testing
 */

import type { DocumentData, SummaryData, AbRunData, AbScoreData } from "../../types/messages";

export const mockDocuments: DocumentData[] = [
  {
    url: "https://example.com/article-1",
    title: "Introduction to TypeScript",
    site: "example.com",
    wordCount: 1500,
    hash: "abc123def456",
    rawText: "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript...",
    sections: [
      { type: "heading", content: "Introduction", level: 1 },
      { type: "paragraph", content: "TypeScript adds static typing to JavaScript..." },
      { type: "heading", content: "Getting Started", level: 2 },
      { type: "paragraph", content: "To get started with TypeScript..." },
    ],
    extractionMetrics: {
      timeMs: 150,
      truncated: false,
      charCount: 8500,
    },
  },
  {
    url: "https://example.com/article-2",
    title: "Advanced React Patterns",
    site: "example.com",
    wordCount: 2200,
    hash: "xyz789ghi012",
    rawText: "React provides powerful composition model and we recommend using composition...",
    sections: [
      { type: "heading", content: "Composition vs Inheritance", level: 1 },
      { type: "paragraph", content: "React has a powerful composition model..." },
      { type: "heading", content: "Render Props", level: 2 },
      { type: "paragraph", content: "The term render prop refers to..." },
    ],
    extractionMetrics: {
      timeMs: 200,
      truncated: false,
      charCount: 12000,
    },
  },
  {
    url: "https://news.example.com/ai-breakthrough",
    title: "Major AI Breakthrough Announced",
    site: "news.example.com",
    wordCount: 850,
    hash: "news123abc",
    rawText: "Scientists have announced a major breakthrough in artificial intelligence...",
    sections: [
      { type: "heading", content: "Breaking News", level: 1 },
      { type: "paragraph", content: "A team of researchers has developed..." },
    ],
    extractionMetrics: {
      timeMs: 100,
      truncated: false,
      charCount: 4500,
    },
  },
];

export const mockSummaryParams = {
  brief: { length: "brief", level: "high_school", style: "plain" } as const,
  medium: { length: "medium", level: "college", style: "bullets" } as const,
  verbose: { length: "verbose", level: "phd", style: "executive" } as const,
};

export const mockSummaries: Omit<SummaryData, "documentId">[] = [
  {
    model: "openai:gpt-4o-mini",
    params: mockSummaryParams.brief,
    content:
      "TypeScript adds static typing to JavaScript, making code more reliable and easier to maintain.",
    savedPath: "/library/summaries/typescript-intro.md",
    savedFormat: "md",
  },
  {
    model: "ollama:llama3.2",
    params: mockSummaryParams.medium,
    content:
      "• React uses composition over inheritance\n• Render props enable component reusability\n• Hooks simplify state management",
    savedPath: "/library/summaries/react-patterns.txt",
    savedFormat: "txt",
  },
];

export const mockAbRuns: Omit<AbRunData, "documentId">[] = [
  {
    modelA: "openai:gpt-4o-mini",
    modelB: "ollama:llama3.2",
    promptTemplate:
      "Summarize the following article in {length} format at a {level} level using {style} style",
    resultA: "Summary from Model A: TypeScript enhances JavaScript with type safety...",
    resultB: "Summary from Model B: TypeScript is a superset of JavaScript that adds types...",
  },
];

export const mockAbScores: Omit<AbScoreData, "runId">[] = [
  {
    coverage: true,
    readability: true,
    faithfulness: true,
    note: "Model A provided better technical accuracy",
    rater: "test-user",
  },
  {
    coverage: false,
    readability: true,
    faithfulness: true,
    note: "Model B missed some key points",
    rater: "test-user",
  },
];

export function generateLargeDataset(count: number): DocumentData[] {
  const documents: DocumentData[] = [];
  for (let i = 0; i < count; i++) {
    documents.push({
      url: `https://example.com/article-${i}`,
      title: `Article ${i}: ${generateTitle()}`,
      site: `site-${Math.floor(i / 100)}.example.com`,
      wordCount: Math.floor(Math.random() * 3000) + 500,
      hash: `hash-${i}-${Date.now()}`,
      rawText: generateContent(i),
      sections: [
        { type: "heading", content: `Main Topic ${i}`, level: 1 },
        { type: "paragraph", content: generateContent(i) },
      ],
      extractionMetrics: {
        timeMs: Math.floor(Math.random() * 300) + 50,
        truncated: Math.random() > 0.9,
        charCount: Math.floor(Math.random() * 15000) + 1000,
      },
    });
  }
  return documents;
}

function generateTitle(): string {
  const topics = [
    "Understanding",
    "Introduction to",
    "Advanced",
    "Mastering",
    "Complete Guide to",
    "Best Practices for",
    "Deep Dive into",
    "Getting Started with",
    "Building",
    "Optimizing",
  ];
  const subjects = [
    "TypeScript",
    "React",
    "Vue",
    "Node.js",
    "GraphQL",
    "Docker",
    "Kubernetes",
    "AWS",
    "Testing",
    "Performance",
  ];
  return `${topics[Math.floor(Math.random() * topics.length)]} ${subjects[Math.floor(Math.random() * subjects.length)]}`;
}

function generateContent(seed: number): string {
  const sentences = [
    "This is an important concept that developers should understand.",
    "The implementation details are crucial for proper usage.",
    "Performance considerations should be taken into account.",
    "Best practices suggest following established patterns.",
    "Modern development requires understanding of these principles.",
    "Testing is essential for maintaining code quality.",
    "Documentation helps teams collaborate effectively.",
    "Security should be a primary concern.",
    "Scalability needs to be considered from the start.",
    "User experience drives design decisions.",
  ];

  const content: string[] = [];
  const numSentences = 5 + (seed % 10);
  for (let i = 0; i < numSentences; i++) {
    content.push(sentences[(seed + i) % sentences.length]);
  }
  return content.join(" ");
}

export class MockDatabase {
  private documents = new Map<number, DocumentData>();
  private summaries = new Map<number, SummaryData>();
  private abRuns = new Map<number, AbRunData>();
  private abScores = new Map<number, AbScoreData>();
  private nextId = 1;

  async insertDocument(doc: DocumentData): Promise<number> {
    const id = this.nextId++;
    this.documents.set(id, doc);
    return id;
  }

  async getDocument(id: number): Promise<DocumentData | null> {
    return this.documents.get(id) || null;
  }

  async searchDocuments(query: string): Promise<Array<DocumentData & { id: number }>> {
    const results: Array<DocumentData & { id: number }> = [];
    for (const [id, doc] of this.documents) {
      if (
        doc.rawText.toLowerCase().includes(query.toLowerCase()) ||
        doc.title.toLowerCase().includes(query.toLowerCase())
      ) {
        results.push({ ...doc, id });
      }
    }
    return results;
  }

  async deleteDocument(id: number): Promise<boolean> {
    return this.documents.delete(id);
  }

  async insertSummary(summary: SummaryData): Promise<number> {
    const id = this.nextId++;
    this.summaries.set(id, summary);
    return id;
  }

  async getSummariesForDocument(documentId: number): Promise<SummaryData[]> {
    const results: SummaryData[] = [];
    for (const summary of this.summaries.values()) {
      if (summary.documentId === documentId) {
        results.push(summary);
      }
    }
    return results;
  }

  async insertAbRun(run: AbRunData): Promise<number> {
    const id = this.nextId++;
    this.abRuns.set(id, run);
    return id;
  }

  async insertAbScore(score: AbScoreData): Promise<number> {
    const id = this.nextId++;
    this.abScores.set(id, score);
    return id;
  }

  clear() {
    this.documents.clear();
    this.summaries.clear();
    this.abRuns.clear();
    this.abScores.clear();
    this.nextId = 1;
  }

  getStats() {
    return {
      documents: this.documents.size,
      summaries: this.summaries.size,
      abRuns: this.abRuns.size,
      abScores: this.abScores.size,
    };
  }
}
