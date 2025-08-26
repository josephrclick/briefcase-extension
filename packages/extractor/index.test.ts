import { describe, it, expect, vi } from "vitest";
import { extractFromDom } from "./index";

// Mock Readability since it's not available in test environment
vi.mock("@mozilla/readability", () => {
  return {
    Readability: vi.fn().mockImplementation((doc) => {
      return {
        parse: () => {
          // Check if the document has article-like content
          const hasArticleContent = doc.querySelector("article") || doc.querySelector("h1");

          if (!hasArticleContent) {
            return null;
          }

          return {
            title: "Test Article Title",
            content: "<p>First paragraph of content.</p><p>Second paragraph of content.</p>",
            textContent: "First paragraph of content. Second paragraph of content.",
            excerpt: "First paragraph of content.",
            byline: "Test Author",
            length: 58,
            siteName: "Test Site",
          };
        },
      };
    }),
  };
});

describe("extractFromDom", () => {
  it("should extract content from a valid article page", () => {
    const mockDoc = document.implementation.createHTMLDocument("");
    mockDoc.body.innerHTML = `
      <article>
        <h1>Article Title</h1>
        <p>First paragraph of content.</p>
        <p>Second paragraph of content.</p>
      </article>
    `;

    // Set location properties
    Object.defineProperty(mockDoc, "location", {
      value: {
        href: "https://example.com/article",
        hostname: "example.com",
      },
      writable: false,
    });

    Object.defineProperty(mockDoc, "title", {
      value: "Page Title",
      writable: false,
    });

    const result = extractFromDom(mockDoc);

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Test Article Title");
    expect(result?.rawText).toBe("First paragraph of content. Second paragraph of content.");
    expect(result?.url).toBe("https://example.com/article");
    expect(result?.site).toBe("example.com");
    expect(result?.wordCount).toBe(8);
    expect(result?.sections).toHaveLength(2);
    expect(result?.sections?.[0]).toEqual({
      id: "p0",
      text: "First paragraph of content.",
    });
    expect(result?.sections?.[1]).toEqual({
      id: "p1",
      text: "Second paragraph of content.",
    });
  });

  it("should return null for non-article pages", () => {
    const mockDoc = document.implementation.createHTMLDocument("");
    mockDoc.body.innerHTML = `
      <div class="navigation">
        <a href="/home">Home</a>
        <a href="/about">About</a>
      </div>
    `;

    Object.defineProperty(mockDoc, "location", {
      value: {
        href: "https://example.com/",
        hostname: "example.com",
      },
      writable: false,
    });

    const result = extractFromDom(mockDoc);

    expect(result).toBeNull();
  });

  it("should handle extraction errors gracefully", () => {
    // Create a document that will cause an error
    const mockDoc = {} as Document;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = extractFromDom(mockDoc);

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Readability extraction failed:"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("should handle documents without location property", () => {
    const mockDoc = document.implementation.createHTMLDocument("");
    mockDoc.body.innerHTML = `
      <article>
        <h1>Article Title</h1>
        <p>Content paragraph.</p>
      </article>
    `;

    // Explicitly set location to undefined to test fallback behavior
    Object.defineProperty(mockDoc, "location", {
      value: undefined,
      writable: false,
    });

    Object.defineProperty(mockDoc, "title", {
      value: "Page Title",
      writable: false,
    });

    const result = extractFromDom(mockDoc);

    expect(result).not.toBeNull();
    expect(result?.url).toBe("");
    expect(result?.site).toBe("");
    expect(result?.title).toBe("Test Article Title");
  });
});
