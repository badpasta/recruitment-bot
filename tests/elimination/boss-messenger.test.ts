import { describe, it, expect, vi, beforeEach } from "vitest";
import { BossMessenger } from "../../src/elimination/boss-messenger.js";
import type { BrowserClient } from "../../src/scraper/browser-client.js";

class MockBrowserClient implements BrowserClient {
  public navigatedUrls: string[] = [];
  public evalResults: unknown[] = [];
  public evalCallCount = 0;
  public clickedSelectors: string[] = [];

  async navigate(url: string) {
    this.navigatedUrls.push(url);
  }

  async getPageContent() {
    return "<html>mock</html>";
  }

  async evaluate<T>(code: string): Promise<T> {
    this.evalCallCount++;
    const result = this.evalResults.shift();
    return result as T;
  }

  async click(selector: string) {
    this.clickedSelectors.push(selector);
  }

  async disconnect() {}
}

describe("BossMessenger", () => {
  let browser: MockBrowserClient;
  let messenger: BossMessenger;
  const CHAT_URL = "https://www.zhipin.com/web/geek/chat";

  beforeEach(() => {
    browser = new MockBrowserClient();
    messenger = new BossMessenger(browser, CHAT_URL);
  });

  it("navigates to chat page before sending", async () => {
    // Setup: evaluate calls:
    // 1. findCandidateChat → returns { element: "chat-item" }
    // 2. clickChat → returns "clicked"
    // 3. typeMessage → returns "typed"
    // 4. sendMessage → returns "sent"
    browser.evalResults = [
      { found: true },      // findCandidateChat
      "clicked",            // clickChat
      "typed",              // typeMessage
      { success: true },    // sendMessage
    ];

    await messenger.sendMessage("c1", "张三", "感谢您的关注");

    expect(browser.navigatedUrls).toContain(CHAT_URL);
  });

  it("returns true on successful send", async () => {
    browser.evalResults = [
      { found: true },
      "clicked",
      "typed",
      { success: true },
    ];

    const result = await messenger.sendMessage("c1", "张三", "感谢您的关注");
    expect(result).toBe(true);
  });

  it("returns false when candidate chat is not found", async () => {
    browser.evalResults = [
      { found: false },
    ];

    const result = await messenger.sendMessage("c1", "张三", "感谢您的关注");
    expect(result).toBe(false);
  });

  it("handles browser errors gracefully", async () => {
    browser.evalResults = [];
    const origEvaluate = browser.evaluate.bind(browser);
    browser.evaluate = async () => {
      throw new Error("Browser disconnected");
    };

    const result = await messenger.sendMessage("c1", "张三", "感谢");
    expect(result).toBe(false);
  });
});
