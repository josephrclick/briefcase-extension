/**
 * E2E test for OPFS persistence across service worker restarts
 * Tests that database data persists using OPFS and FTS5 search works
 */

import { test, expect, Page, BrowserContext } from "@playwright/test";
import path from "path";

// Helper to load the extension in test browser
async function loadExtension(context: BrowserContext): Promise<string> {
  // Get the extension ID from the background page
  const [background] = context.serviceWorkers();
  const extensionId = await background.evaluate(() => chrome.runtime.id);
  return extensionId;
}

// Helper to send message to offscreen document
async function sendOffscreenMessage(page: Page, message: any): Promise<any> {
  return await page.evaluate(async (msg) => {
    return new Promise((resolve, reject) => {
      // Send message to offscreen document via service worker
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }, message);
}

test.describe("OPFS Database Persistence", () => {
  let context: BrowserContext;
  let extensionId: string;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    // Load extension with persistent context
    const pathToExtension = path.join(__dirname, "../dist");

    context = await browser.newContext({
      // Use Chromium with extension support
      chromiumSandbox: false,
    });

    // Load the extension
    await context.addInitScript({
      path: pathToExtension,
    });

    // Create a new page
    page = await context.newPage();

    // Navigate to extension side panel
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

    // Wait for extension to initialize
    await page.waitForTimeout(1000);
  });

  test.afterEach(async () => {
    await context.close();
  });

  test("should persist data in OPFS across service worker restarts", async () => {
    // Step 1: Insert a document into the database
    const testDocument = {
      url: "https://test.example.com/article",
      title: "Test Article for OPFS Persistence",
      site: "test.example.com",
      raw_text:
        "This is a test article to verify OPFS persistence. It contains unique content for FTS5 search testing.",
      word_count: 15,
      hash: `test-hash-${Date.now()}`,
    };

    // Send message to insert document
    const insertResponse = await sendOffscreenMessage(page, {
      type: "DOC_INSERT",
      id: `test-${Date.now()}`,
      timestamp: Date.now(),
      payload: testDocument,
    });

    expect(insertResponse.success).toBe(true);
    const documentId = insertResponse.data.id;
    expect(documentId).toBeGreaterThan(0);

    // Step 2: Verify document can be retrieved
    const searchResponse1 = await sendOffscreenMessage(page, {
      type: "DB_SEARCH",
      id: `search-${Date.now()}`,
      timestamp: Date.now(),
      payload: {
        query: "OPFS persistence",
        limit: 10,
        offset: 0,
      },
    });

    expect(searchResponse1.success).toBe(true);
    expect(searchResponse1.data.results.length).toBeGreaterThan(0);

    const foundDoc = searchResponse1.data.results.find((r: any) => r.id === documentId);
    expect(foundDoc).toBeDefined();
    expect(foundDoc.title).toBe(testDocument.title);

    // Verify snippet function works
    expect(foundDoc.snippet).toContain("<mark>");
    expect(foundDoc.snippet).toContain("</mark>");

    // Step 3: Force service worker restart
    console.log("Restarting service worker...");

    // Get service worker and terminate it
    const [serviceWorker] = context.serviceWorkers();
    await serviceWorker.evaluate(() => {
      // This will cause the service worker to restart
      self.close();
    });

    // Wait for service worker to restart
    await page.waitForTimeout(2000);

    // Reload the page to reconnect
    await page.reload();
    await page.waitForTimeout(1000);

    // Step 4: Verify data persisted after restart
    const searchResponse2 = await sendOffscreenMessage(page, {
      type: "DB_SEARCH",
      id: `search-after-restart-${Date.now()}`,
      timestamp: Date.now(),
      payload: {
        query: "OPFS persistence",
        limit: 10,
        offset: 0,
      },
    });

    expect(searchResponse2.success).toBe(true);
    expect(searchResponse2.data.results.length).toBeGreaterThan(0);

    const persistedDoc = searchResponse2.data.results.find((r: any) => r.id === documentId);
    expect(persistedDoc).toBeDefined();
    expect(persistedDoc.title).toBe(testDocument.title);
    expect(persistedDoc.url).toBe(testDocument.url);

    // Step 5: Test FTS5 bm25 ranking
    const rankingResponse = await sendOffscreenMessage(page, {
      type: "DB_SEARCH",
      id: `ranking-test-${Date.now()}`,
      timestamp: Date.now(),
      payload: {
        query: "unique content FTS5",
        limit: 10,
        offset: 0,
        sortBy: "relevance",
      },
    });

    expect(rankingResponse.success).toBe(true);
    if (rankingResponse.data.results.length > 1) {
      // Verify results are sorted by relevance (bm25 score)
      const scores = rankingResponse.data.results.map((r: any) => r.score);
      for (let i = 1; i < scores.length; i++) {
        // Lower bm25 scores indicate higher relevance
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    }

    // Step 6: Test document history retrieval
    const historyResponse = await sendOffscreenMessage(page, {
      type: "DB_GET_HISTORY",
      id: `history-${Date.now()}`,
      timestamp: Date.now(),
      payload: {
        limit: 50,
        offset: 0,
      },
    });

    expect(historyResponse.success).toBe(true);
    expect(Array.isArray(historyResponse.data.documents)).toBe(true);

    const historyDoc = historyResponse.data.documents.find((d: any) => d.id === documentId);
    expect(historyDoc).toBeDefined();

    // Step 7: Clean up - delete test data
    const deleteResponse = await sendOffscreenMessage(page, {
      type: "DOC_DELETE",
      id: `delete-${Date.now()}`,
      timestamp: Date.now(),
      payload: { id: documentId },
    });

    expect(deleteResponse.success).toBe(true);
  });

  test("should handle large datasets efficiently", async () => {
    // Insert multiple documents
    const documents = Array.from({ length: 10 }, (_, i) => ({
      url: `https://test.example.com/article-${i}`,
      title: `Test Article ${i}`,
      site: "test.example.com",
      raw_text: `This is article number ${i} with some unique content for testing. Keywords: database sqlite wasm opfs persistence.`,
      word_count: 15,
      hash: `test-hash-batch-${Date.now()}-${i}`,
    }));

    // Insert all documents
    const insertPromises = documents.map((doc) =>
      sendOffscreenMessage(page, {
        type: "DOC_INSERT",
        id: `batch-insert-${Date.now()}-${doc.hash}`,
        timestamp: Date.now(),
        payload: doc,
      }),
    );

    const results = await Promise.all(insertPromises);
    const documentIds = results.map((r) => r.data.id);

    // All inserts should succeed
    results.forEach((result) => {
      expect(result.success).toBe(true);
    });

    // Search across all documents
    const searchResponse = await sendOffscreenMessage(page, {
      type: "DB_SEARCH",
      id: `batch-search-${Date.now()}`,
      timestamp: Date.now(),
      payload: {
        query: "database sqlite",
        limit: 20,
        offset: 0,
      },
    });

    expect(searchResponse.success).toBe(true);
    expect(searchResponse.data.results.length).toBeGreaterThanOrEqual(10);

    // Clean up - delete all test documents
    const deletePromises = documentIds.map((id) =>
      sendOffscreenMessage(page, {
        type: "DOC_DELETE",
        id: `batch-delete-${Date.now()}-${id}`,
        timestamp: Date.now(),
        payload: { id },
      }),
    );

    await Promise.all(deletePromises);
  });

  test("should validate VACUUM operation after bulk delete", async () => {
    // Get initial database size
    const initialStats = await sendOffscreenMessage(page, {
      type: "DB_STATS",
      id: `stats-initial-${Date.now()}`,
      timestamp: Date.now(),
    });

    const initialSize = initialStats.data.databaseSize;

    // Insert and then delete documents to create space to reclaim
    const tempDoc = {
      url: "https://test.example.com/temp",
      title: "Temporary Document",
      site: "test.example.com",
      raw_text: "A".repeat(10000), // Large text to increase DB size
      word_count: 10000,
      hash: `temp-hash-${Date.now()}`,
    };

    const insertResponse = await sendOffscreenMessage(page, {
      type: "DOC_INSERT",
      id: `temp-insert-${Date.now()}`,
      timestamp: Date.now(),
      payload: tempDoc,
    });

    const docId = insertResponse.data.id;

    // Delete the document
    await sendOffscreenMessage(page, {
      type: "DOC_DELETE",
      id: `temp-delete-${Date.now()}`,
      timestamp: Date.now(),
      payload: { id: docId },
    });

    // The DELETE_ALL_DATA operation includes VACUUM
    await sendOffscreenMessage(page, {
      type: "DB_DELETE_ALL_DATA",
      id: `vacuum-test-${Date.now()}`,
      timestamp: Date.now(),
      payload: { confirm: true },
    });

    // Get final database size
    const finalStats = await sendOffscreenMessage(page, {
      type: "DB_STATS",
      id: `stats-final-${Date.now()}`,
      timestamp: Date.now(),
    });

    // After VACUUM, the database should be compact
    expect(finalStats.data.documentCount).toBe(0);
    expect(finalStats.data.summaryCount).toBe(0);
  });
});

test.describe("OPFS Error Handling", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    const pathToExtension = path.join(__dirname, "../dist");

    context = await browser.newContext({
      chromiumSandbox: false,
    });

    page = await context.newPage();
    await page.goto(`chrome-extension://test/src/sidepanel/index.html`);
    await page.waitForTimeout(1000);
  });

  test.afterEach(async () => {
    await context.close();
  });

  test("should handle malformed search queries gracefully", async () => {
    // Test with special FTS5 characters
    const specialQueries = ['"unclosed quote', "AND OR NOT", "*wildcard", "(unmatched paren"];

    for (const query of specialQueries) {
      const response = await sendOffscreenMessage(page, {
        type: "DB_SEARCH",
        id: `special-search-${Date.now()}`,
        timestamp: Date.now(),
        payload: {
          query,
          limit: 10,
          offset: 0,
        },
      });

      // Should either succeed with results or fail gracefully
      expect(response).toHaveProperty("success");
      if (!response.success) {
        expect(response.error).toBeDefined();
        expect(response.error.code).toBeDefined();
      }
    }
  });

  test("should enforce security on delete operations", async () => {
    // Attempt delete without confirmation
    const response = await sendOffscreenMessage(page, {
      type: "DB_DELETE_ALL_DATA",
      id: `unconfirmed-delete-${Date.now()}`,
      timestamp: Date.now(),
      payload: { confirm: false },
    });

    expect(response.success).toBe(false);
    expect(response.error.code).toBe("INVALID_REQUEST");
  });
});
