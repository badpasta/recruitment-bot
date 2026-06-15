import { describe, it, expect, beforeEach } from "vitest";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { ResultStore } from "../../src/store/results.js";
import { EliminationStore } from "../../src/store/elimination.js";
import { EliminationProcessor } from "../../src/elimination/processor.js";
import type { PlatformMessenger } from "../../src/types/index.js";

class MockMessenger implements PlatformMessenger {
  public sentMessages: { candidateId: string; candidateName: string; message: string }[] = [];

  async sendMessage(candidateId: string, candidateName: string, message: string): Promise<boolean> {
    this.sentMessages.push({ candidateId, candidateName, message });
    return true;
  }
}

describe("E2E: Elimination Flow", () => {
  let db: ReturnType<typeof initDatabase>;
  let messenger: MockMessenger;
  let eliminationStore: EliminationStore;
  let resultStore: ResultStore;
  let candidateStore: CandidateStore;
  let processor: EliminationProcessor;

  const templates = [
    "{{name}}您好，感谢关注，岗位暂时不太匹配，祝好。",
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
  });

  /**
   * E2E-1: Full elimination flow
   * 1. Candidate passes screening → email sent → boss replies "淘汰"
   * 2. ReplyMonitor updates status to "eliminated"
   * 3. EliminationProcessor detects eliminated candidate
   * 4. Sends rejection message via Boss直聘
   * 5. Records in elimination_log
   */
  it("E2E-1: complete elimination flow from status change to platform reply", async () => {
    // Seed candidate
    candidateStore.upsert({
      id: "e1",
      name: "淘汰测试候选人",
      profileUrl: "https://www.zhipin.com/test",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });

    // Simulate: candidate was passed, then email reply changed status to eliminated
    resultStore.insert({
      candidateId: "e1",
      positionName: "运维工程师",
      status: "eliminated",
      score: 20,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 20,
        threshold: 15,
      },
    });

    // Run elimination processor
    const processed = await processor.processEliminated("运维工程师");

    // Verify
    expect(processed).toBe(1);
    expect(messenger.sentMessages.length).toBe(1);
    expect(messenger.sentMessages[0].candidateId).toBe("e1");
    expect(messenger.sentMessages[0].candidateName).toBe("淘汰测试候选人");
    expect(messenger.sentMessages[0].message).toContain("淘汰测试候选人");

    // Verify elimination_log
    const entry = eliminationStore.getEntry("e1", "运维工程师");
    expect(entry).not.toBeNull();
    expect(entry!.reason).toBe("eliminated");
    expect(entry!.platformReplied).toBe(true);
  });

  /**
   * E2E-2: Idempotency
   * Running elimination processor twice:
   * - First run: processes the eliminated candidate
   * - Second run: skips, processes 0
   */
  it("E2E-2: idempotency - second run processes no new candidates", async () => {
    candidateStore.upsert({
      id: "e2",
      name: "幂等测试",
      profileUrl: "",
      rawProfile: { skills: [], workHistory: [], projectHistory: [] },
    });

    resultStore.insert({
      candidateId: "e2",
      positionName: "运维工程师",
      status: "eliminated",
      score: 0,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 0,
        threshold: 15,
      },
    });

    const first = await processor.processEliminated("运维工程师");
    expect(first).toBe(1);

    const second = await processor.processEliminated("运维工程师");
    expect(second).toBe(0);
    expect(messenger.sentMessages.length).toBe(1);
  });
});
