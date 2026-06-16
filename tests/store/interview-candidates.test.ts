import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewCandidateStore } from "../../src/store/interview-candidates.js";

describe("InterviewCandidateStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let store: InterviewCandidateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    store = new InterviewCandidateStore(db);
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  afterEach(() => { db.close(); });

  it("inserts an interview candidate", () => {
    const id = store.insert({
      candidateId: "c1", positionName: "Test", scheduleStatus: "waiting_time",
    });
    expect(typeof id).toBe("number");
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found).not.toBeNull();
    expect(found!.scheduleStatus).toBe("waiting_time");
  });

  it("enforces UNIQUE(candidate_id, position_name)", () => {
    store.insert({ candidateId: "c1", positionName: "Test", scheduleStatus: "waiting_time" });
    expect(() => store.insert({ candidateId: "c1", positionName: "Test", scheduleStatus: "time_proposed" }))
      .toThrow();
  });

  it("gets candidates by status", () => {
    store.insert({ candidateId: "c1", positionName: "P1", scheduleStatus: "waiting_time" });
    candidates.upsert({
      id: "c2", name: "李四", profileUrl: "https://zhipin.com/geek/c2",
      rawProfile: { skills: ["docker"], workHistory: [], projectHistory: [] },
    });
    store.insert({ candidateId: "c2", positionName: "P2", scheduleStatus: "confirmed" });
    expect(store.getByStatus("waiting_time")).toHaveLength(1);
    expect(store.getByStatus("confirmed")).toHaveLength(1);
    expect(store.getByStatus("scheduled")).toHaveLength(0);
  });

  it("gets by candidate and position", () => {
    store.insert({
      candidateId: "c1", positionName: "Test", scheduleStatus: "time_proposed",
      resumeSummary: "5 years K8s experience",
    });
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found!.resumeSummary).toBe("5 years K8s experience");
  });

  it("returns null for unknown candidate+position", () => {
    expect(store.getByCandidateAndPosition("no", "no")).toBeNull();
  });

  it("updates status", () => {
    store.insert({ candidateId: "c1", positionName: "Test", scheduleStatus: "waiting_time" });
    store.updateStatus("c1", "Test", "scheduled");
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found!.scheduleStatus).toBe("scheduled");
  });

  it("updates resume summary", () => {
    store.insert({ candidateId: "c1", positionName: "Test", scheduleStatus: "waiting_time" });
    store.updateResumeSummary("c1", "Test", "Updated summary");
    const found = store.getByCandidateAndPosition("c1", "Test");
    expect(found!.resumeSummary).toBe("Updated summary");
  });

  it("lists all candidates", () => {
    store.insert({ candidateId: "c1", positionName: "P1", scheduleStatus: "waiting_time" });
    candidates.upsert({
      id: "c2", name: "李四", profileUrl: "https://zhipin.com/geek/c2",
      rawProfile: { skills: ["docker"], workHistory: [], projectHistory: [] },
    });
    store.insert({ candidateId: "c2", positionName: "P2", scheduleStatus: "cancelled" });
    expect(store.listAll()).toHaveLength(2);
  });
});
