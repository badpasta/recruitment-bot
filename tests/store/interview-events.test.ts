import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewEventStore } from "../../src/store/interview-events.js";

describe("InterviewEventStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let store: InterviewEventStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    store = new InterviewEventStore(db);
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  afterEach(() => { db.close(); });

  it("inserts an interview event", () => {
    const id = store.insert({
      candidateId: "c1",
      positionName: "高级后端",
      interviewType: "video",
      scheduledAt: "2026-06-20T10:00:00Z",
      status: "scheduled",
    });
    expect(id).toBeGreaterThan(0);
  });

  it("gets events by candidate ID", () => {
    store.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "phone", scheduledAt: "2026-06-20T10:00:00Z", status: "scheduled",
    });
    store.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "video", scheduledAt: "2026-06-21T14:00:00Z", status: "scheduled",
    });
    const events = store.getByCandidateId("c1");
    expect(events).toHaveLength(2);
    expect(events[0].interviewType).toBe("video"); // newest first
    expect(events[1].interviewType).toBe("phone");
  });

  it("returns empty array for candidate with no events", () => {
    expect(store.getByCandidateId("nonexistent")).toEqual([]);
  });

  it("gets events filtered by status", () => {
    store.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "phone", scheduledAt: "2026-06-20T10:00:00Z", status: "scheduled",
    });
    store.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "video", scheduledAt: "2026-06-21T14:00:00Z", status: "completed",
    });
    expect(store.getByStatus("scheduled")).toHaveLength(1);
    expect(store.getByStatus("completed")).toHaveLength(1);
    expect(store.getByStatus("cancelled")).toHaveLength(0);
  });

  it("updates event status", () => {
    const id = store.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "phone", scheduledAt: "2026-06-20T10:00:00Z", status: "scheduled",
    });
    store.updateStatus(id, "completed");
    const events = store.getByStatus("completed");
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(id);
  });

  it("inserts event with optional notes", () => {
    const id = store.insert({
      candidateId: "c1", positionName: "高级后端",
      interviewType: "onsite", scheduledAt: "2026-06-20T10:00:00Z",
      status: "scheduled", notes: "需要带作品集",
    });
    const events = store.getByCandidateId("c1");
    expect(events[0].notes).toBe("需要带作品集");
  });
});
