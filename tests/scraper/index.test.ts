import { describe, it, expect, beforeEach } from "vitest";
import { Scraper } from "../../src/scraper/index.js";
import type { BrowserClient } from "../../src/scraper/browser-client.js";
import type { Candidate } from "../../src/types/index.js";
import { extractCandidateId } from "../../src/utils/anti-detect.js";

class MockBrowserClient implements BrowserClient {
  public navigatedUrls: string[] = [];
  public evaluateCallCount = 0;
  private listResult: unknown = [];
  private detailResult: unknown = {};
  private shouldThrow = false;

  setListResult(result: unknown): void {
    this.listResult = result;
  }

  setDetailResult(result: unknown): void {
    this.detailResult = result;
  }

  setShouldThrow(value: boolean): void {
    this.shouldThrow = value;
  }

  async navigate(url: string): Promise<void> {
    this.navigatedUrls.push(url);
  }

  async getPageContent(): Promise<string> {
    return "<html>mock</html>";
  }

  async evaluate<T>(_code: string): Promise<T> {
    if (this.shouldThrow) throw new Error("Browser error");
    this.evaluateCallCount++;
    // First call: candidate list; subsequent: detail pages
    if (this.evaluateCallCount === 1) return this.listResult as T;
    return this.detailResult as T;
  }

  async click(_selector: string): Promise<void> {}
  async disconnect(): Promise<void> {}
}

class MockCandidateStore {
  private existingIds = new Set<string>();
  public upsertedCandidates: Candidate[] = [];

  addExisting(id: string): void {
    this.existingIds.add(id);
  }

  exists(id: string): boolean {
    return this.existingIds.has(id);
  }

  upsert(candidate: Candidate): void {
    this.upsertedCandidates.push(candidate);
    this.existingIds.add(candidate.id);
  }
}

const BOSS_URL = "https://www.zhipin.com/web/boss/recommend";

const MOCK_RAW_LIST = [
  {
    name: "张三",
    status: "在职",
    skills: "k8s, docker",
    experienceYears: "3-5年",
    salaryExpectation: "16-18K",
    profileUrl: "https://www.zhipin.com/gongke/candidate_abc001.html",
  },
  {
    name: "李四",
    status: "在职",
    skills: "Python",
    experienceYears: "2年",
    salaryExpectation: "15K",
    profileUrl: "https://www.zhipin.com/gongke/candidate_def002.html",
  },
];

const MOCK_RAW_DETAIL = {
  skills: ["k8s", "docker", "helm"],
  workHistory: [
    { company: "公司A", title: "运维工程师", startDate: "2020", endDate: "至今", description: "k8s运维" },
  ],
  projectHistory: [{ name: "项目A", description: "CI/CD" }],
  selfEvaluation: "热爱技术",
};

describe("Scraper", () => {
  let browser: MockBrowserClient;
  let store: MockCandidateStore;
  let scraper: Scraper;

  beforeEach(() => {
    browser = new MockBrowserClient();
    store = new MockCandidateStore();
    scraper = new Scraper(store as never, { minDelay: 0, maxDelay: 0 });
  });

  describe("filterNew", () => {
    it("returns only IDs not already in the store", () => {
      store.addExisting("id-1");
      store.addExisting("id-3");

      const result = scraper.filterNew(
        ["id-1", "id-2", "id-3", "id-4"],
        (id) => store.exists(id),
      );
      expect(result).toEqual(["id-2", "id-4"]);
    });

    it("respects maxPerRound limit", () => {
      const limitedScraper = new Scraper(store as never, {
        maxPerRound: 2,
        minDelay: 0,
        maxDelay: 0,
      });
      const result = limitedScraper.filterNew(
        ["id-1", "id-2", "id-3", "id-4"],
        () => false,
      );
      expect(result).toHaveLength(2);
      expect(result).toEqual(["id-1", "id-2"]);
    });

    it("returns all IDs when none exist", () => {
      const result = scraper.filterNew(
        ["id-1", "id-2"],
        () => false,
      );
      expect(result).toEqual(["id-1", "id-2"]);
    });

    it("returns empty array when all exist", () => {
      store.addExisting("id-1");
      store.addExisting("id-2");
      const result = scraper.filterNew(
        ["id-1", "id-2"],
        (id) => store.exists(id),
      );
      expect(result).toEqual([]);
    });
  });

  describe("scrapeRound", () => {
    it("navigates to bossUrl and extracts candidate list", async () => {
      browser.setListResult(MOCK_RAW_LIST);
      browser.setDetailResult(MOCK_RAW_DETAIL);

      await scraper.scrapeRound(browser, BOSS_URL);
      expect(browser.navigatedUrls).toContain(BOSS_URL);
    });

    it("processes each new candidate and fetches their detail", async () => {
      browser.setListResult(MOCK_RAW_LIST);
      browser.setDetailResult(MOCK_RAW_DETAIL);

      const results = await scraper.scrapeRound(browser, BOSS_URL);
      expect(results.length).toBe(2);
      expect(results[0].name).toBe("张三");
      expect(results[1].name).toBe("李四");
    });

    it("skips already-existing candidates", async () => {
      const existingId = extractCandidateId(MOCK_RAW_LIST[0].profileUrl);
      store.addExisting(existingId);

      browser.setListResult(MOCK_RAW_LIST);
      browser.setDetailResult(MOCK_RAW_DETAIL);

      const results = await scraper.scrapeRound(browser, BOSS_URL);
      // Only the second candidate should be processed
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("李四");
    });

    it("handles evaluate errors gracefully", async () => {
      browser.setShouldThrow(true);

      // Should not throw, just log error and return empty
      const results = await scraper.scrapeRound(browser, BOSS_URL);
      expect(results).toEqual([]);
    });

    it("upserts candidates to the store", async () => {
      browser.setListResult(MOCK_RAW_LIST);
      browser.setDetailResult(MOCK_RAW_DETAIL);

      await scraper.scrapeRound(browser, BOSS_URL);
      expect(store.upsertedCandidates.length).toBe(2);
    });

    it("navigates to each candidate's profile URL and back to bossUrl", async () => {
      browser.setListResult(MOCK_RAW_LIST);
      browser.setDetailResult(MOCK_RAW_DETAIL);

      await scraper.scrapeRound(browser, BOSS_URL);

      // bossUrl → candidate1 profile → bossUrl → candidate2 profile → bossUrl
      const bossNavigations = browser.navigatedUrls.filter((u) => u === BOSS_URL);
      expect(bossNavigations.length).toBeGreaterThanOrEqual(3);
    });
  });
});
