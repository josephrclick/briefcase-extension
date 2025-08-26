import { Readability } from "@mozilla/readability";

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

/**
 * Extracts the main content from a DOM document using Mozilla's Readability.js
 * @param doc The document to extract content from
 * @returns ExtractedPayload with article content, or null if extraction fails
 */
export function extractFromDom(doc: Document): ExtractedPayload | null {
  try {
    // Clone the document to avoid modifying the live DOM
    // Readability mutates the DOM it operates on
    const documentClone = doc.cloneNode(true) as Document;

    // Create a new Readability instance and parse the content
    const reader = new Readability(documentClone);
    const article = reader.parse();

    // Handle cases where Readability fails to find article content
    if (!article) {
      // Return null to signal that no article was found
      // The calling function should handle this appropriately
      return null;
    }

    // Extract the cleaned content
    const { title, textContent, content } = article;

    // Parse the sanitized HTML to reconstruct sections
    // This maintains compatibility with the original data structure
    const articleDom = new DOMParser().parseFromString(content, "text/html");
    const paragraphs = Array.from(articleDom.querySelectorAll("p"));
    const sections = paragraphs.map((p, i) => ({
      id: `p${i}`,
      text: p.textContent || "",
    }));

    // Calculate word count from the cleaned text
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;

    return {
      url: doc.location?.href || "",
      title: title || doc.title || "",
      site: doc.location?.hostname || "",
      rawText: textContent,
      sections: sections,
      wordCount: wordCount,
    };
  } catch (error) {
    // Log error for debugging but return null to handle gracefully
    console.error("Readability extraction failed:", error);
    return null;
  }
}
