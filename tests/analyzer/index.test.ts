import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewEventStore } from "../../src/store/interview-events.js";
import { InterviewFeedbackStore } from "../../src/store/interview-feedback.js";
import type { StrategyAdjustment } from "../../src/types/index.js";

// Track mock calls across tests
const mockCreateFn = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreateFn },
  })),
}));

import { AIStrategyAnalyzer } from "../../src/analyzer/index.js";

function makeConfigYaml(passThreshold = 15): string {
  return `
positions:
  - name: "中级运维工程师_北京 16-18k"
    boss_url: "https://www.zhipin.com/web/geek/chat"
    screening:
      required:
        - field: "status"
          not_in: ["在职-暂不考虑"]
        - field: "skills"
          contains_any: ["k8s", "kubernetes"]
      preferred:
        - field: "skills"
          contains_any: ["docker", "containerd"]
          weight: 10
        - field: "experience_years"
          min: 3
          max: 7
          weight: 10
      pass_threshold: ${passThreshold}
`;
}

function makeMockResponse(adjustments: StrategyAdjustment[]) {
  return {
    id: "msg_123",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: JSON.stringify({ adjustments }) }],
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe("AIStrategyAnalyzer", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let events: InterviewEventStore;
  let feedbackStore: InterviewFeedbackStore;
  let configPath: string;

  beforeEach(() => {
    mockCreateFn.mockReset();

    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    events = new InterviewEventStore(db);
    feedbackStore = new InterviewFeedbackStore(db);

    configPath = join(tmpdir(), `test-screening-${Date.now()}.yaml`);
    writeFileSync(configPath, makeConfigYaml(), "utf-8");

    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s", "docker"], workHistory: [], projectHistory: [] },
    });
    candidates.upsert({
      id: "c2", name: "李四", profileUrl: "https://zhipin.com/geek/c2",
      rawProfile: { skills: ["python"], workHistory: [], projectHistory: [] },
    });

    const e1 = events.insert({
      candidateId: "c1", positionName: "中级运维工程师_北京 16-18k",
      interviewType: "video", scheduledAt: "2026-06-10T10:00:00Z", status: "completed",
    });
    const e2 = events.insert({
      candidateId: "c2", positionName: "中级运维工程师_北京 16-18k",
      interviewType: "video", scheduledAt: "2026-06-11T10:00:00Z", status: "completed",
    });

    feedbackStore.insert({
      interviewEventId: e1, candidateId: "c1",
      dimensions: [
        { name: "k8s能力", rating: 5, comment: "非常熟练" },
        { name: "CI/CD", rating: 4, comment: "有Jenkins经验" },
      ],
      overallComment: "技术能力出色，k8s和CI/CD都很好",
      recommended: true,
      interviewerName: "面试官A",
    });

    feedbackStore.insert({
      interviewEventId: e2, candidateId: "c2",
      dimensions: [
        { name: "Python", rating: 4, comment: "Python熟练" },
        { name: "沟通", rating: 2, comment: "表达能力弱" },
      ],
      overallComment: "技术栈不匹配，缺乏k8s经验，沟通能力差",
      recommended: false,
      interviewerName: "面试官B",
    });
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(configPath); } catch { /* ok */ }
  });

  describe("analyze()", () => {
    it("returns structured analysis result with correct metadata", async () => {
      const adjustments: StrategyAdjustment[] = [
        {
          type: "add",
          targetRule: { field: "skills", position: "required", containsAny: ["CI/CD", "Jenkins"] },
          reason: "多次面试反馈显示CI/CD经验是重要区分指标",
        },
      ];
      mockCreateFn.mockResolvedValue(makeMockResponse(adjustments));

      const analyzer = new AIStrategyAnalyzer(feedbackStore, configPath, "fake-key");
      const result = await analyzer.analyze(10);

      expect(result.adjustments).toEqual(adjustments);
      expect(result.analyzedFeedbackCount).toBe(2);
      expect(result.analyzedAt).toBeDefined();
      expect(new Date(result.analyzedAt).getTime()).not.toBeNaN();
    });

    it("limits feedback to N most recent entries", async () => {
      mockCreateFn.mockResolvedValue(makeMockResponse([]));

      const analyzer = new AIStrategyAnalyzer(feedbackStore, configPath, "fake-key");
      await analyzer.analyze(1);

      const call = mockCreateFn.mock.calls[0][0];
      expect(call.messages[0].content).toContain("1 条");
    });

    it("loads current screening config and includes it in the prompt", async () => {
      mockCreateFn.mockResolvedValue(makeMockResponse([]));

      const analyzer = new AIStrategyAnalyzer(feedbackStore, configPath, "fake-key");
      await analyzer.analyze(10);

      const call = mockCreateFn.mock.calls[0][0];
      expect(call.system).toContain("策略");
      expect(call.messages[0].content).toContain("k8s");
      expect(call.messages[0].content).toContain("screening.yaml");
    });

    it("returns empty adjustments when there is no feedback", async () => {
      const db2 = initDatabase(":memory:");
      const fs2 = new InterviewFeedbackStore(db2);
      const configPath2 = join(tmpdir(), `test-screening-empty-${Date.now()}.yaml`);
      writeFileSync(configPath2, makeConfigYaml(), "utf-8");

      const analyzer = new AIStrategyAnalyzer(fs2, configPath2, "fake-key");
      const result = await analyzer.analyze(10);

      expect(result.adjustments).toEqual([]);
      expect(result.analyzedFeedbackCount).toBe(0);

      db2.close();
      try { unlinkSync(configPath2); } catch { /* ok */ }
    });

    it("sends candidate data and feedback summary to the AI", async () => {
      mockCreateFn.mockResolvedValue(makeMockResponse([]));

      const analyzer = new AIStrategyAnalyzer(feedbackStore, configPath, "fake-key");
      await analyzer.analyze(10);

      const call = mockCreateFn.mock.calls[0][0];
      const userMessage = call.messages[0].content as string;
      expect(userMessage).toContain("c1");
      expect(userMessage).toContain("推荐");
      expect(userMessage).toContain("面试官A");
    });

    it("parses AI response JSON with multiple adjustment types", async () => {
      const adjustments: StrategyAdjustment[] = [
        { type: "add", targetRule: { field: "skills", position: "required", containsAny: ["CI/CD"] }, reason: "出现频率高" },
        { type: "modify", targetRule: { field: "experience_years", position: "preferred", min: 2, weight: 8 }, reason: "降低门槛" },
        { type: "delete", targetRule: { field: "status", position: "required" }, reason: "状态筛选无区分度" },
      ];
      mockCreateFn.mockResolvedValue(makeMockResponse(adjustments));

      const analyzer = new AIStrategyAnalyzer(feedbackStore, configPath, "fake-key");
      const result = await analyzer.analyze(10);

      expect(result.adjustments).toHaveLength(3);
      expect(result.adjustments[0].type).toBe("add");
      expect(result.adjustments[1].type).toBe("modify");
      expect(result.adjustments[2].type).toBe("delete");
    });

    it("throws on invalid AI response JSON", async () => {
      mockCreateFn.mockResolvedValue({
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "not valid json" }],
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const analyzer = new AIStrategyAnalyzer(feedbackStore, configPath, "fake-key");
      await expect(analyzer.analyze(10)).rejects.toThrow("Failed to parse AI response as JSON");
    });
  });
});
