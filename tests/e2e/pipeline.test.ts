import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { ResultStore } from "../../src/store/results.js";
import { RunStateStore } from "../../src/store/run-state.js";
import { EmailLogStore } from "../../src/store/email-log.js";
import { Scraper } from "../../src/scraper/index.js";
import { Screener } from "../../src/screener/index.js";
import { EmailSender } from "../../src/email/sender.js";
import { ReplyMonitor } from "../../src/email/monitor.js";
import type { EmailTransport, ImapClient, ImapMessage } from "../../src/email/types.js";
import type { BrowserClient } from "../../src/scraper/browser-client.js";
import type { ScreeningConfig, CandidateProfile, Candidate, EmailConfig } from "../../src/types/index.js";
import type Database from "better-sqlite3";

/**
 * MockBrowserClient simulates kimi-webbridge responses.
 * Configure with setCandidateList and setCandidateDetail before each test.
 */
class MockBrowserClient implements BrowserClient {
  public navigatedUrls: string[] = [];
  private candidateList: unknown = [];
  private candidateDetail: unknown = {};
  private evalCallCount = 0;
  private dataCallCount = 0;

  setCandidateList(list: unknown): void {
    this.candidateList = list;
  }

  setCandidateDetail(detail: unknown): void {
    this.candidateDetail = detail;
  }

  async navigate(url: string): Promise<void> {
    this.navigatedUrls.push(url);
  }

  async getPageContent(): Promise<string> {
    return "<html>mock</html>";
  }

  async evaluate<T>(code: string): Promise<T> {
    this.evalCallCount++;
    // Click-via-JS calls return a string result
    if (code.includes("scrollIntoView")) return "clicked" as T;
    // Data calls: first is list, rest are detail
    this.dataCallCount++;
    if (this.dataCallCount === 1) return this.candidateList as T;
    return this.candidateDetail as T;
  }

  async click(_selector: string): Promise<void> {}
  async disconnect(): Promise<void> {}
}

const BOSS_URL = "https://www.zhipin.com/web/boss/recommend";

const screeningConfig: ScreeningConfig = {
  required: [
    { field: "status", notIn: ["离职", "暂不考虑"] },
    { field: "skills", containsAny: ["k8s", "ci-cd", "CI/CD"] },
  ],
  preferred: [
    { field: "skills", containsAny: ["docker"], weight: 10 },
    { field: "skills", containsAny: ["helm"], weight: 8 },
    { field: "experienceYears", min: 3, weight: 10 },
    { field: "salaryExpectation", max: 20000, weight: 5 },
  ],
  passThreshold: 15,
};

const RAW_CANDIDATE_LIST = [
  {
    name: "张三",
    status: "在职",
    skills: "k8s, docker, helm",
    experienceYears: "3-5年",
    salaryExpectation: "16-18K",
    profileUrl: "https://www.zhipin.com/gongke/zhangsan123.html",
  },
  {
    name: "李四",
    status: "在职",
    skills: "Python, Django",
    experienceYears: "2年",
    salaryExpectation: "12-15K",
    profileUrl: "https://www.zhipin.com/gongke/lisi456789.html",
  },
  {
    name: "王五",
    status: "离职",
    skills: "k8s, docker",
    experienceYears: "5年",
    salaryExpectation: "20-25K",
    profileUrl: "https://www.zhipin.com/gongke/wangwu0001.html",
  },
];

const RAW_CANDIDATE_DETAIL = {
  skills: ["k8s", "docker", "helm"],
  workHistory: [
    {
      company: "公司A",
      title: "高级运维工程师",
      startDate: "2020-01",
      endDate: "至今",
      description: "负责k8s集群运维",
    },
  ],
  projectHistory: [
    { name: "CI/CD平台", description: "搭建CI/CD pipeline" },
  ],
  selfEvaluation: "热爱运维，持续学习",
};

describe("E2E Pipeline Tests", () => {
  let db: Database.Database;
  let candidateStore: CandidateStore;
  let resultStore: ResultStore;
  let runState: RunStateStore;
  let browser: MockBrowserClient;
  let scraper: Scraper;
  let screener: Screener;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidateStore = new CandidateStore(db);
    resultStore = new ResultStore(db);
    runState = new RunStateStore(db);
    browser = new MockBrowserClient();
    scraper = new Scraper(candidateStore, { minDelay: 0, maxDelay: 0 });
    screener = new Screener(screeningConfig);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * E2E-1: Complete screening happy path
   * Given a list of candidates from the browser, the full pipeline:
   * 1. Scrapes candidates from browser
   * 2. Stores candidates in DB
   * 3. Screens each candidate against rules
   * 4. Stores screening results in DB
   * 5. Candidates passing all required rules + threshold get "passed" status
   */
  it("E2E-1: complete screening happy path", async () => {
    browser.setCandidateList(RAW_CANDIDATE_LIST);
    browser.setCandidateDetail(RAW_CANDIDATE_DETAIL);

    const candidates = await scraper.scrapeRound(browser, BOSS_URL);

    // At least some candidates should have been scraped
    expect(candidates.length).toBeGreaterThan(0);

    let passed = 0;
    let rejected = 0;
    for (const candidate of candidates) {
      const result = screener.screen(candidate.id, "运维工程师", candidate.rawProfile);
      resultStore.insert(result);

      if (result.status === "passed") passed++;
      else rejected++;
    }

    // Verify results were stored
    const passedResults = resultStore.getByStatus("passed");
    const rejectedResults = resultStore.getByStatus("rejected");

    expect(passed + rejected).toBe(candidates.length);
    expect(passedResults.length).toBe(passed);
    expect(rejectedResults.length).toBe(rejected);

    // Verify candidates were persisted
    for (const candidate of candidates) {
      expect(candidateStore.exists(candidate.id)).toBe(true);
    }
  });

  /**
   * E2E-2: Deduplication / idempotency
   * Running scrapeRound twice with the same candidate list:
   * - First run: processes all candidates
   * - Second run: skips already-processed candidates, processes 0 new ones
   */
  it("E2E-2: deduplication - second run processes no new candidates", async () => {
    browser.setCandidateList(RAW_CANDIDATE_LIST);
    browser.setCandidateDetail(RAW_CANDIDATE_DETAIL);

    // First run
    const firstRun = await scraper.scrapeRound(browser, BOSS_URL);
    expect(firstRun.length).toBeGreaterThan(0);

    // Reset eval counter for second run
    const browser2 = new MockBrowserClient();
    browser2.setCandidateList(RAW_CANDIDATE_LIST);
    browser2.setCandidateDetail(RAW_CANDIDATE_DETAIL);

    // Second run - same candidates, should be deduplicated
    const secondRun = await scraper.scrapeRound(browser2, BOSS_URL);
    expect(secondRun.length).toBe(0);
  });

  /**
   * E2E-3: Hard filter rejection
   * Candidates failing required rules are rejected even if they score highly on preferred rules.
   * 王五 has k8s+docker skills (passes required) but status="离职" (fails not_in required rule).
   * 李四 has Python only (fails skills contains_any required rule).
   */
  it("E2E-3: candidates failing required rules are rejected regardless of preferred score", () => {
    // Candidate with good skills but blocked status
    const profile1: CandidateProfile = {
      status: "离职",
      skills: ["k8s", "docker", "helm", "CI/CD"],
      experienceYears: 10,
      salaryExpectation: 15000,
      workHistory: [],
      projectHistory: [],
    };
    const result1 = screener.screen("blocked-status", "运维工程师", profile1);
    expect(result1.status).toBe("rejected");
    expect(result1.score).toBe(0);

    // Candidate with no matching required skills
    const profile2: CandidateProfile = {
      status: "在职",
      skills: ["Python", "Django", "Flask"],
      experienceYears: 10,
      salaryExpectation: 15000,
      workHistory: [],
      projectHistory: [],
    };
    const result2 = screener.screen("no-skills", "运维工程师", profile2);
    expect(result2.status).toBe("rejected");
    expect(result2.score).toBe(0);
  });

  /**
   * E2E-4: Config validation
   * Screener with invalid/edge-case configs behaves correctly.
   */
  it("E2E-4: screener handles edge cases in config", () => {
    // Config with no required rules and threshold=0 → everyone passes
    const openConfig: ScreeningConfig = {
      required: [],
      preferred: [],
      passThreshold: 0,
    };
    const openScreener = new Screener(openConfig);

    const profile: CandidateProfile = {
      skills: [],
      workHistory: [],
      projectHistory: [],
    };
    const result = openScreener.screen("anyone", "运维工程师", profile);
    expect(result.status).toBe("passed");
    expect(result.score).toBe(0);

    // Config with impossible threshold → no one passes (if required passes but no preferred weight)
    const strictConfig: ScreeningConfig = {
      required: [],
      preferred: [{ field: "skills", containsAny: ["nonexistent_skill_xyz"], weight: 1 }],
      passThreshold: 100,
    };
    const strictScreener = new Screener(strictConfig);

    const result2 = strictScreener.screen("skilled", "运维工程师", profile);
    expect(result2.status).toBe("rejected");
  });

  /**
   * E2E-5: Run state tracking (graceful pause/resume)
   * When is_paused is set, the scan round should be skipped.
   */
  it("E2E-5: run state pause prevents scanning", async () => {
    // Simulate the scanRound logic from index.ts
    runState.set("is_paused", "true");

    // If paused, scan round should return early
    const isPaused = runState.get("is_paused") === "true";
    expect(isPaused).toBe(true);

    // Simulate scanning by not calling scraper when paused
    let scanned = false;
    if (!isPaused) {
      browser.setCandidateList(RAW_CANDIDATE_LIST);
      browser.setCandidateDetail(RAW_CANDIDATE_DETAIL);
      await scraper.scrapeRound(browser, BOSS_URL);
      scanned = true;
    }
    expect(scanned).toBe(false);

    // Resume
    runState.set("is_paused", "false");
    expect(runState.get("is_paused")).toBe("false");

    // Now scan should proceed
    browser.setCandidateList(RAW_CANDIDATE_LIST);
    browser.setCandidateDetail(RAW_CANDIDATE_DETAIL);
    const candidates = await scraper.scrapeRound(browser, BOSS_URL);
    expect(candidates.length).toBeGreaterThan(0);
  });
});

class MockEmailTransport implements EmailTransport {
  public sentMails: { to: string; subject: string; html: string }[] = [];
  public messageIdCounter = 0;

  async sendMail(options: { to: string; subject: string; html: string }) {
    this.sentMails.push(options);
    this.messageIdCounter++;
    return { messageId: `<mock-${this.messageIdCounter}@test>` };
  }
}

class MockImapClient implements ImapClient {
  public messages: ImapMessage[] = [];
  public markedSeen: number[] = [];

  async connect() {}
  async fetchUnseen() { return this.messages; }
  async markSeen(uid: number) { this.markedSeen.push(uid); }
  async disconnect() {}
}

describe("E2E Email Integration", () => {
  const emailConfig: EmailConfig = {
    smtpHost: "",
    smtpPort: 465,
    smtpUser: "",
    fromName: "",
    to: "boss@test.com",
    imapHost: "",
    imapPort: 993,
    imapUser: "",
    replyKeywords: { interview: ["约面试"], eliminated: ["淘汰"] },
  };

  it("sends email for passed candidate and processes interview reply", async () => {
    const db = initDatabase(":memory:");
    const candidateStore = new CandidateStore(db);
    const resultStore = new ResultStore(db);
    const emailLogStore = new EmailLogStore(db);

    // Seed candidate
    candidateStore.upsert({
      id: "c1",
      name: "张三",
      profileUrl: "",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });

    // Insert passed screening
    resultStore.insert({
      candidateId: "c1",
      positionName: "运维",
      status: "passed",
      score: 20,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 20,
        threshold: 15,
      },
    });

    // Send email
    const transport = new MockEmailTransport();
    const sender = new EmailSender(
      transport,
      emailLogStore,
      resultStore,
      candidateStore,
      emailConfig,
    );
    await sender.sendPending("运维");
    expect(transport.sentMails.length).toBe(1);

    // Verify sent log
    const sentLog = emailLogStore.findByMessageId("<mock-1@test>");
    expect(sentLog).not.toBeNull();

    // Simulate reply
    const imapClient = new MockImapClient();
    imapClient.messages = [
      {
        uid: 1,
        messageId: "<reply-001@test>",
        inReplyTo: "<mock-1@test>",
        subject: "Re: 招聘筛选",
        text: "约面试",
      },
    ];
    const monitor = new ReplyMonitor(
      imapClient,
      emailLogStore,
      resultStore,
      emailConfig,
    );
    await monitor.checkReplies();

    // Verify status updated to interview
    const results = resultStore.getByStatus("interview");
    expect(results.length).toBe(1);
    expect(results[0].candidateId).toBe("c1");

    db.close();
  });

  it("sends email and processes eliminated reply", async () => {
    const db = initDatabase(":memory:");
    const candidateStore = new CandidateStore(db);
    const resultStore = new ResultStore(db);
    const emailLogStore = new EmailLogStore(db);

    candidateStore.upsert({
      id: "c2",
      name: "李四",
      profileUrl: "",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });

    resultStore.insert({
      candidateId: "c2",
      positionName: "运维",
      status: "passed",
      score: 20,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 20,
        threshold: 15,
      },
    });

    const transport = new MockEmailTransport();
    const sender = new EmailSender(
      transport,
      emailLogStore,
      resultStore,
      candidateStore,
      emailConfig,
    );
    await sender.sendPending("运维");

    const imapClient = new MockImapClient();
    imapClient.messages = [
      {
        uid: 1,
        messageId: "<reply-002@test>",
        inReplyTo: "<mock-1@test>",
        subject: "Re: 招聘筛选",
        text: "不合适，淘汰",
      },
    ];
    const monitor = new ReplyMonitor(
      imapClient,
      emailLogStore,
      resultStore,
      emailConfig,
    );
    await monitor.checkReplies();

    const results = resultStore.getByStatus("eliminated");
    expect(results.length).toBe(1);
    expect(results[0].candidateId).toBe("c2");

    db.close();
  });
});
