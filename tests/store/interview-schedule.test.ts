import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewScheduleStore } from "../../src/store/interview-schedule.js";

describe("InterviewScheduleStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let store: InterviewScheduleStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    store = new InterviewScheduleStore(db);
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  afterEach(() => { db.close(); });

  it("inserts a schedule", () => {
    const id = store.insert({
      candidateId: "c1", positionName: "Test", status: "waiting_time",
      interviewTime: "2026-06-20T10:00:00Z",
    });
    expect(typeof id).toBe("number");
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found).not.toBeNull();
    expect(found!.status).toBe("waiting_time");
  });

  it("enforces UNIQUE(candidate_id, position_name)", () => {
    store.insert({ candidateId: "c1", positionName: "Test", status: "waiting_time" });
    expect(() => store.insert({ candidateId: "c1", positionName: "Test", status: "waiting_time" }))
      .toThrow();
  });

  it("gets by candidate and position", () => {
    store.insert({
      candidateId: "c1", positionName: "Test", status: "scheduled",
      interviewTime: "2026-06-20T10:00:00Z",
      meetingLink: "https://meeting.tencent.com/abc",
      calendarEventId: "evt_123",
    });
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found!.meetingLink).toBe("https://meeting.tencent.com/abc");
    expect(found!.calendarEventId).toBe("evt_123");
    expect(found!.interviewTime).toBe("2026-06-20T10:00:00Z");
  });

  it("returns null for unknown candidate+position", () => {
    expect(store.getByCandidateAndPosition("no", "no")).toBeNull();
  });

  it("gets schedules by time range", () => {
    store.insert({ candidateId: "c1", positionName: "P1", status: "scheduled", interviewTime: "2026-06-20T10:00:00Z" });
    candidates.upsert({
      id: "c2", name: "李四", profileUrl: "https://zhipin.com/geek/c2",
      rawProfile: { skills: ["docker"], workHistory: [], projectHistory: [] },
    });
    store.insert({ candidateId: "c2", positionName: "P2", status: "scheduled", interviewTime: "2026-06-20T14:00:00Z" });
    candidates.upsert({
      id: "c3", name: "王五", profileUrl: "https://zhipin.com/geek/c3",
      rawProfile: { skills: ["docker"], workHistory: [], projectHistory: [] },
    });
    store.insert({ candidateId: "c3", positionName: "P3", status: "scheduled", interviewTime: "2026-06-21T10:00:00Z" });

    const inRange = store.getByTimeRange("2026-06-20T00:00:00Z", "2026-06-20T23:59:59Z");
    expect(inRange).toHaveLength(2);
  });

  it("gets schedules by status", () => {
    store.insert({ candidateId: "c1", positionName: "P1", status: "confirmed" });
    store.insert({ candidateId: "c1", positionName: "P2", status: "scheduled" });
    expect(store.getByStatus("confirmed")).toHaveLength(1);
    expect(store.getByStatus("cancelled")).toHaveLength(0);
  });

  it("updates schedule fields via updateSchedule", () => {
    store.insert({ candidateId: "c1", positionName: "Test", status: "waiting_time" });
    store.updateSchedule("c1", "Test", {
      interviewTime: "2026-06-22T09:00:00Z",
      meetingLink: "https://meeting.tencent.com/xyz",
      status: "scheduled",
    });
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found!.interviewTime).toBe("2026-06-22T09:00:00Z");
    expect(found!.meetingLink).toBe("https://meeting.tencent.com/xyz");
    expect(found!.status).toBe("scheduled");
  });

  it("updateSchedule ignores undefined fields", () => {
    store.insert({
      candidateId: "c1", positionName: "Test", status: "waiting_time",
      interviewTime: "2026-06-20T10:00:00Z",
    });
    store.updateSchedule("c1", "Test", { status: "cancelled" });
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found!.interviewTime).toBe("2026-06-20T10:00:00Z");
    expect(found!.status).toBe("cancelled");
  });

  it("updateStatus shortcut works", () => {
    store.insert({ candidateId: "c1", positionName: "Test", status: "waiting_time" });
    store.updateStatus("c1", "Test", "confirmed");
    expect(store.getByCandidateAndPosition("c1", "Test")!.status).toBe("confirmed");
  });
});
