import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewEventStore } from "../../src/store/interview-events.js";
import { InterviewFeedbackStore } from "../../src/store/interview-feedback.js";

describe("InterviewFeedbackStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let events: InterviewEventStore;
  let store: InterviewFeedbackStore;
  let eventId: number;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    events = new InterviewEventStore(db);
    store = new InterviewFeedbackStore(db);

    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    eventId = events.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "video", scheduledAt: "2026-06-20T10:00:00Z", status: "completed",
    });
  });

  afterEach(() => { db.close(); });

  it("inserts feedback", () => {
    const id = store.insert({
      interviewEventId: eventId,
      candidateId: "c1",
      dimensions: [
        { name: "技术能力", rating: 4, comment: "基础扎实" },
        { name: "沟通能力", rating: 3 },
      ],
      overallComment: "整体表现不错",
      recommended: true,
      interviewerName: "李面试官",
    });
    expect(id).toBeGreaterThan(0);
  });

  it("gets feedback by candidate ID", () => {
    store.insert({
      interviewEventId: eventId, candidateId: "c1",
      dimensions: [{ name: "技术能力", rating: 4 }],
      overallComment: "好", recommended: true, interviewerName: "李",
    });
    const feedbacks = store.getByCandidateId("c1");
    expect(feedbacks).toHaveLength(1);
    expect(feedbacks[0].dimensions).toEqual([{ name: "技术能力", rating: 4 }]);
    expect(feedbacks[0].recommended).toBe(true);
  });

  it("returns empty array for candidate with no feedback", () => {
    expect(store.getByCandidateId("nonexistent")).toEqual([]);
  });

  it("gets feedback by interview event ID", () => {
    store.insert({
      interviewEventId: eventId, candidateId: "c1",
      dimensions: [{ name: "沟通", rating: 5 }],
      overallComment: "优秀", recommended: true, interviewerName: "王",
    });
    const feedbacks = store.getByEventId(eventId);
    expect(feedbacks).toHaveLength(1);
    expect(feedbacks[0].interviewerName).toBe("王");
  });

  it("gets feedback filtered by recommendation status", () => {
    store.insert({
      interviewEventId: eventId, candidateId: "c1",
      dimensions: [{ name: "技术", rating: 5 }],
      overallComment: "推荐", recommended: true, interviewerName: "A",
    });

    // Create a second event + feedback (not recommended)
    const event2 = events.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "onsite", scheduledAt: "2026-06-22T10:00:00Z", status: "completed",
    });
    store.insert({
      interviewEventId: event2, candidateId: "c1",
      dimensions: [{ name: "文化匹配", rating: 2 }],
      overallComment: "不推荐", recommended: false, interviewerName: "B",
    });

    const recommended = store.getByRecommended(true);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].interviewerName).toBe("A");

    const notRecommended = store.getByRecommended(false);
    expect(notRecommended).toHaveLength(1);
    expect(notRecommended[0].interviewerName).toBe("B");
  });

  it("preserves dimension comments through round-trip", () => {
    store.insert({
      interviewEventId: eventId, candidateId: "c1",
      dimensions: [
        { name: "系统设计", rating: 3, comment: "需要加强" },
        { name: "编码能力", rating: 4, comment: "代码质量高" },
      ],
      overallComment: "整体良好", recommended: true, interviewerName: "C",
    });
    const feedbacks = store.getByCandidateId("c1");
    expect(feedbacks[0].dimensions).toEqual([
      { name: "系统设计", rating: 3, comment: "需要加强" },
      { name: "编码能力", rating: 4, comment: "代码质量高" },
    ]);
  });
});
