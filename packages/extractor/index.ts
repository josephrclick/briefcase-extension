export interface ExtractedSection {
  id: string;
  text: string;
}
export interface ExtractedPayload {
  url: string;
  title: string;
  site?: string;
  rawText: string;
  sections?: ExtractedSection[];
  wordCount: number;
}
export function extractFromDom(doc: Document): ExtractedPayload {
  const title = document.title || "";
  const article = document.querySelector("article") || document.body;
  const paras = Array.from(article.querySelectorAll("p"));
  const text = paras.map((p) => p.textContent?.trim() || "").join("\n\n");
  return {
    url: location.href,
    title,
    site: location.hostname,
    rawText: text,
    sections: paras.map((p, i) => ({ id: `p${i}`, text: p.textContent || "" })),
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}
