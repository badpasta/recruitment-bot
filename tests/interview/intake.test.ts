import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { Intake } from "../../src/interview/intake.js";
import type { ScreeningResult } from "../../src/types/index.js";

describe("Intake", () => {
  let db: Database.Database;
  let candidates: CandidateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
  });

  afterEach(() => { db.close(); });

  function insertScreeningResult(candidateId: string, positionName: string, status: string) {
    db.prepare(
      `INSERT INTO screening_results (candidate_id, position_name, status, score, match_details)
       VALUES (?, ?, ?, 25, '{}')`,
    ).run(candidateId, positionName, status);
  }

  it("scans and inserts new interview candidates", () => {
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://example.com/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    insertScreeningResult("c1", "中级运维工程师", "interview");

    const intake = new Intake(db);
    const newcomers = intake.scan();

    expect(newcomers).toHaveLength(1);
    expect(newcomers[0].candidateId).toBe("c1");
    expect(newcomers[0].scheduleStatus).toBe("waiting_time");
  });

  it("deduplicates: skips candidates already in interview_candidates", () => {
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://example.com/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    insertScreeningResult("c1", "中级运维工程师", "interview");

    const intake = new Intake(db);
    const first = intake.scan();
    expect(first).toHaveLength(1);

    // Second scan should find nothing new
    const second = intake.scan();
    expect(second).toHaveLength(0);
  });

  it("ignores non-interview statuses", () => {
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://example.com/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    insertScreeningResult("c1", "中级运维工程师", "passed");

    const intake = new Intake(db);
    const newcomers = intake.scan();
    expect(newcomers).toHaveLength(0);
  });

  it("handles multiple candidates correctly", () => {
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://example.com/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    candidates.upsert({
      id: "c2", name: "李四", profileUrl: "https://example.com/c2",
      rawProfile: { skills: ["docker"], workHistory: [], projectHistory: [] },
    });
    insertScreeningResult("c1", "中级运维工程师", "interview");
    insertScreeningResult("c2", "中级运维工程师", "interview");

    const intake = new Intake(db);
    const newcomers = intake.scan();
    expect(newcomers).toHaveLength(2);
  });
});
