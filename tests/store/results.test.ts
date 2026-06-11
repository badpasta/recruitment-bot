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
});
