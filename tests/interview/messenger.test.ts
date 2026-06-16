import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewCandidateStore } from "../../src/store/interview-candidates.js";
import { InterviewMessageStore } from "../../src/store/interview-messages.js";
import { Messenger } from "../../src/interview/messenger.js";
import type { BrowserClient } from "../../src/scraper/browser-client.js";
import type { InterviewSlot } from "../../src/types/index.js";

function makeSlots(n: number): InterviewSlot[] {
  return Array.from({ length: n }, (_, i) => ({
    startTime: `2026-06-${16 + i}T10:00:00+08:00`,
    endTime: `2026-06-${16 + i}T11:00:00+08:00`,
    label: `6月${16 + i}日 10:00-11:00`,
    available: true,
  }));
}

function futureTime(minutesFromNow: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutesFromNow);
  return d.toISOString();
}

function createMockBrowser(): BrowserClient & { navigate: ReturnType<typeof vi.fn>; evaluate: ReturnType<typeof vi.fn>; click: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; getPageContent: ReturnType<typeof vi.fn> } {
  return {
    navigate: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    getPageContent: vi.fn().mockResolvedValue(""),
    click: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Messenger", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let candidateStore: InterviewCandidateStore;
  let messageStore: InterviewMessageStore;
  let browser: ReturnType<typeof createMockBrowser>;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    candidateStore = new InterviewCandidateStore(db);
    messageStore = new InterviewMessageStore(db);
    browser = createMockBrowser();

    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    candidateStore.insert({
      candidateId: "c1",
      positionName: "中级运维工程师",
      scheduleStatus: "waiting_time",
    });
  });

  afterEach(() => { db.close(); });

  describe("sendMessage", () => {
    it("sends a message and records it in interview_messages", async () => {
      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}，可选时间：\n{slots}\n请回复编号。",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200], // Short for testing
      });

      browser.evaluate.mockResolvedValueOnce("发送成功");

      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      const msgs = messageStore.getByCandidateAndPosition("c1", "中级运维工程师");
      const outbound = msgs.filter((m) => m.direction === "sent");
      expect(outbound.length).toBeGreaterThanOrEqual(1);
      expect(outbound[0].content).toContain("张三");
      expect(outbound[0].content).toContain("6月16日");
    });

    it("throws if a session is already active for the same candidate", async () => {
      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200],
      });

      browser.evaluate.mockResolvedValue("发送成功");
      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      await expect(
        messenger.sendMessage(
          { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
          "张三",
          makeSlots(2),
        ),
      ).rejects.toThrow(/already active/i);
    });
  });

  describe("pollReplies", () => {
    it("detects a slot selection reply and fires onConfirmed callback", async () => {
      const onConfirmed = vi.fn();
      const onDeclined = vi.fn();
      const onTimeout = vi.fn();
      const onError = vi.fn();

      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}，可选时间：\n{slots}\n请回复编号。",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200],
      });

      messenger.setCallbacks({ onConfirmed, onDeclined, onTimeout, onError });

      // First call: send success
      browser.evaluate.mockResolvedValueOnce("发送成功");
      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      browser.evaluate.mockResolvedValueOnce([
        { text: "您好 张三，可选时间：\n1. 6月16日 10:00-11:00\n2. 6月17日 10:00-11:00\n请回复编号。", isMine: true, time: futureTime(2) },
        { text: "选1", isMine: false, time: futureTime(5) },
      ]);

      await messenger.pollReplies();

      expect(onConfirmed).toHaveBeenCalledTimes(1);
      expect(onDeclined).not.toHaveBeenCalled();
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("detects a decline reply and fires onDeclined callback", async () => {
      const onConfirmed = vi.fn();
      const onDeclined = vi.fn();
      const onTimeout = vi.fn();
      const onError = vi.fn();

      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}，可选时间：\n{slots}\n请回复编号。",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200],
      });

      messenger.setCallbacks({ onConfirmed, onDeclined, onTimeout, onError });

      browser.evaluate.mockResolvedValueOnce("发送成功");
      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      browser.evaluate.mockResolvedValueOnce([
        { text: "您好 张三，可选时间：\n1. 6月16日 10:00-11:00\n2. 6月17日 10:00-11:00\n请回复编号。", isMine: true, time: futureTime(2) },
        { text: "不去了", isMine: false, time: futureTime(5) },
      ]);

      await messenger.pollReplies();

      expect(onDeclined).toHaveBeenCalledTimes(1);
      expect(onConfirmed).not.toHaveBeenCalled();
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("does not fire callback if no new messages since last poll", async () => {
      const onConfirmed = vi.fn();
      const onDeclined = vi.fn();

      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200],
      });

      messenger.setCallbacks({ onConfirmed, onDeclined, onTimeout: vi.fn(), onError: vi.fn() });

      browser.evaluate.mockResolvedValueOnce("发送成功");
      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      // Poll returns only the outbound message (no new inbound)
      browser.evaluate.mockResolvedValueOnce([
        { text: "您好 张三", isMine: true, time: futureTime(2) },
      ]);

      await messenger.pollReplies();

      expect(onConfirmed).not.toHaveBeenCalled();
      expect(onDeclined).not.toHaveBeenCalled();
    });

    it("fires onTimeout after all poll intervals exhausted without reply", async () => {
      const onTimeout = vi.fn();
      const onConfirmed = vi.fn();
      const onDeclined = vi.fn();

      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200], // 2 stages
      });

      messenger.setCallbacks({ onConfirmed, onDeclined, onTimeout, onError: vi.fn() });

      browser.evaluate.mockResolvedValueOnce("发送成功");
      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      // First poll - no reply
      browser.evaluate.mockResolvedValueOnce([
        { text: "您好 张三", isMine: true, time: futureTime(2) },
      ]);
      await messenger.pollReplies();
      expect(onTimeout).not.toHaveBeenCalled();

      // Second poll - still no reply (last retry stage)
      browser.evaluate.mockResolvedValueOnce([
        { text: "您好 张三", isMine: true, time: futureTime(4) },
      ]);
      await messenger.pollReplies();
      expect(onTimeout).not.toHaveBeenCalled();

      // Third poll - exhausted all retries → timeout
      browser.evaluate.mockResolvedValueOnce([
        { text: "您好 张三", isMine: true, time: futureTime(6) },
      ]);
      await messenger.pollReplies();

      expect(onTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("shutdown", () => {
    it("closes all active browser sessions", async () => {
      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200],
      });

      browser.evaluate.mockResolvedValue("发送成功");
      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      expect(browser.disconnect).not.toHaveBeenCalled();
      await messenger.shutdown();
      expect(browser.disconnect).toHaveBeenCalled();
    });
  });

  describe("activeSessionCount", () => {
    it("returns the number of active poll sessions", async () => {
      const messenger = new Messenger(browser, messageStore, candidateStore, {
        bossChatUrl: "https://zhipin.com/web/geek/chat",
        messageTemplate: "您好 {name}",
        replyTimeoutDays: 3,
        pollIntervalsMs: [100, 200],
      });

      expect(messenger.activeSessionCount).toBe(0);

      browser.evaluate.mockResolvedValue("发送成功");
      await messenger.sendMessage(
        { candidateId: "c1", positionName: "中级运维工程师", scheduleStatus: "waiting_time" },
        "张三",
        makeSlots(2),
      );

      expect(messenger.activeSessionCount).toBe(1);
    });
  });
});
