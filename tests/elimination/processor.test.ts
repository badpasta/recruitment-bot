import { describe, it, expect, beforeEach } from "vitest";
import { EliminationProcessor } from "../../src/elimination/processor.js";
import { EliminationStore } from "../../src/store/elimination.js";
import { ResultStore } from "../../src/store/results.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { initDatabase } from "../../src/store/db.js";
import type { PlatformMessenger } from "../../src/types/index.js";

class MockMessenger implements PlatformMessenger {
  public sentMessages: { candidateId: string; candidateName: string; message: string }[] = [];
  public shouldSucceed = true;

  async sendMessage(candidateId: string, candidateName: string, message: string): Promise<boolean> {
    this.sentMessages.push({ candidateId, candidateName, message });
    return this.shouldSucceed;
  }
}

describe("EliminationProcessor", () => {
  let db: ReturnType<typeof initDatabase>;
  let processor: EliminationProcessor;
  let messenger: MockMessenger;
  let eliminationStore: EliminationStore;
  let resultStore: ResultStore;
  let candidateStore: CandidateStore;

  const templates = [
    "感谢{{name}}的关注，经过综合评估，该岗位暂时不太匹配，祝您前程似锦。",
    "{{name}}您好，感谢您的投递，目前该岗位已有合适人选，祝好。",
  ];

  beforeEach(() => {
    db = initDatabase(":memory:");
    messenger = new MockMessenger();
    eliminationStore = new EliminationStore(db);
    resultStore = new ResultStore(db);
    candidateStore = new CandidateStore(db);

    processor = new EliminationProcessor(
      eliminationStore,
      resultStore,
      candidateStore,
      messenger,
      templates,
    );

    // Seed candidates
    candidateStore.upsert({
      id: "c1",
      name: "张三",
      profileUrl: "",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    candidateStore.upsert({
      id: "c2",
      name: "李四",
      profileUrl: "",
      rawProfile: { skills: ["Python"], workHistory: [], projectHistory: [] },
    });
  });

  it("processes eliminated candidates and sends rejection messages", async () => {
    // Insert eliminated screening results
    resultStore.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      status: "eliminated",
      score: 0,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 },
    });

    const processed = await processor.processEliminated("运维工程师");
    expect(processed).toBe(1);
    expect(messenger.sentMessages.length).toBe(1);
    expect(messenger.sentMessages[0].candidateId).toBe("c1");
    expect(messenger.sentMessages[0].message).toContain("张三");

    // Check elimination_log
    expect(eliminationStore.isEliminated("c1", "运维工程师")).toBe(true);
    const entry = eliminationStore.getEntry("c1", "运维工程师");
    expect(entry!.platformReplied).toBe(true);
  });

  it("skips already-eliminated candidates", async () => {
    resultStore.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      status: "eliminated",
      score: 0,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 },
    });

    await processor.processEliminated("运维工程师");
    const secondRun = await processor.processEliminated("运维工程师");
    expect(secondRun).toBe(0);
    expect(messenger.sentMessages.length).toBe(1);
  });

  it("records elimination even when message send fails", async () => {
    messenger.shouldSucceed = false;

    resultStore.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      status: "eliminated",
      score: 0,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 },
    });

    const processed = await processor.processEliminated("运维工程师");
    expect(processed).toBe(1);

    // Still recorded, but platform_replied = false
    const entry = eliminationStore.getEntry("c1", "运维工程师");
    expect(entry).not.toBeNull();
    expect(entry!.platformReplied).toBe(false);
  });

  it("processes multiple eliminated candidates", async () => {
    resultStore.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      status: "eliminated",
      score: 0,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 },
    });
    resultStore.insert({
      candidateId: "c2",
      positionName: "运维工程师",
      status: "eliminated",
      score: 0,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 },
    });

    const processed = await processor.processEliminated("运维工程师");
    expect(processed).toBe(2);
    expect(messenger.sentMessages.length).toBe(2);
  });

  it("returns 0 when no eliminated candidates exist", async () => {
    const processed = await processor.processEliminated("运维工程师");
    expect(processed).toBe(0);
    expect(messenger.sentMessages.length).toBe(0);
  });

  it("uses reason from email keyword detection", async () => {
    resultStore.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      status: "eliminated",
      score: 0,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 },
    });

    const processed = await processor.processEliminated("运维工程师");
    expect(processed).toBe(1);

    const entry = eliminationStore.getEntry("c1", "运维工程师");
    expect(entry!.reason).toBe("eliminated");
  });
});
