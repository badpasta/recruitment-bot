import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { ResultStore } from "../../src/store/results.js";

describe("ResultStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let results: ResultStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    results = new ResultStore(db);
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  afterEach(() => { db.close(); });

  it("inserts a screening result", () => {
    results.insert({
      candidateId: "c1", positionName: "Test", status: "passed", score: 25,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 25, threshold: 15 },
    });
    const all = results.getByStatus("passed");
    expect(all).toHaveLength(1);
    expect(all[0].score).toBe(25);
  });

  it("gets results filtered by status", () => {
    results.insert({ candidateId: "c1", positionName: "Test", status: "passed", score: 25, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 25, threshold: 15 } });
    results.insert({ candidateId: "c1", positionName: "Test2", status: "rejected", score: 5, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 5, threshold: 15 } });
    expect(results.getByStatus("passed")).toHaveLength(1);
    expect(results.getByStatus("rejected")).toHaveLength(1);
  });

  it("updates status by candidate ID and position", () => {
    results.insert({ candidateId: "c1", positionName: "Test", status: "pending", score: 0, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 } });
    results.updateStatus("c1", "Test", "passed");
    expect(results.getByStatus("passed")).toHaveLength(1);
  });

  it("supports interview and eliminated statuses", () => {
    const id1 = results.insert({ candidateId: "c1", positionName: "Test", status: "passed", score: 25, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 25, threshold: 15 } });
    results.updateStatusById(id1, "interview");
    expect(results.getByStatus("interview")).toHaveLength(1);

    const id2 = results.insert({ candidateId: "c1", positionName: "Test2", status: "passed", score: 10, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 10, threshold: 15 } });
    results.updateStatusById(id2, "eliminated");
    expect(results.getByStatus("eliminated")).toHaveLength(1);
  });

  describe("getPassedNotNotified", () => {
    it("returns passed results that have not been emailed", () => {
      results.insert({ candidateId: "c1", positionName: "A", status: "passed", score: 20, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 } });
      results.insert({ candidateId: "c1", positionName: "B", status: "rejected", score: 5, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 5, threshold: 15 } });
      const pending = results.getPassedNotNotified();
      expect(pending).toHaveLength(1);
      expect(pending[0].positionName).toBe("A");
    });

    it("excludes results already marked as email-notified", () => {
      const id = results.insert({ candidateId: "c1", positionName: "A", status: "passed", score: 20, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 } });
      results.markEmailNotified(id);
      expect(results.getPassedNotNotified()).toHaveLength(0);
    });
  });

  describe("markEmailNotified", () => {
    it("sets email_notified_at timestamp", () => {
      const id = results.insert({ candidateId: "c1", positionName: "A", status: "passed", score: 20, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 } });
      results.markEmailNotified(id);
      const result = results.getById(id);
      expect(result).not.toBeNull();
      expect(result!.emailNotifiedAt).toBeDefined();
    });
  });

  describe("updateStatusById", () => {
    it("updates status by row ID", () => {
      const id = results.insert({ candidateId: "c1", positionName: "A", status: "passed", score: 20, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 } });
      results.updateStatusById(id, "interview");
      const result = results.getById(id);
      expect(result!.status).toBe("interview");
    });
  });

  describe("getById", () => {
    it("returns null for non-existent ID", () => {
      expect(results.getById(99999)).toBeNull();
    });

    it("returns the result with all fields", () => {
      const id = results.insert({ candidateId: "c1", positionName: "Test", status: "passed", score: 25, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 25, threshold: 15 } });
      const result = results.getById(id);
      expect(result).not.toBeNull();
      expect(result!.candidateId).toBe("c1");
      expect(result!.positionName).toBe("Test");
      expect(result!.score).toBe(25);
    });
  });
});
