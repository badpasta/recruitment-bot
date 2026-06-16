import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { EliminationStore } from "../../src/store/elimination.js";
import { ResultStore } from "../../src/store/results.js";
import type { EliminationRecord, MatchDetails } from "../../src/types/index.js";

describe("EliminationStore", () => {
  let db: Database.Database;
  let store: EliminationStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new EliminationStore(db);
    // Seed a candidate for FK references
    db.prepare(
      `INSERT INTO candidates (id, name, profile_url, raw_profile)
       VALUES ('cand-001', '张三', 'https://example.com/zhangsan', '{}')`
    ).run();
  });

  describe("insert", () => {
    it("inserts an elimination record and returns its id", () => {
      const record: EliminationRecord = {
        candidateId: "cand-001",
        positionName: "前端开发",
        reason: "经验不足",
        templateUsed: "experience_mismatch",
        platformReplied: false,
      };
      const id = store.insert(record);
      expect(id).toBeGreaterThan(0);
    });

    it("inserts with only required fields", () => {
      const record: EliminationRecord = {
        candidateId: "cand-001",
        positionName: "后端开发",
        platformReplied: false,
      };
      const id = store.insert(record);
      expect(id).toBeGreaterThan(0);
    });
  });

  describe("isEliminated", () => {
    it("returns false for a candidate who has not been eliminated", () => {
      expect(store.isEliminated("nonexistent")).toBe(false);
    });

    it("returns false for a candidate with no elimination record", () => {
      expect(store.isEliminated("cand-001")).toBe(false);
    });

    it("returns true for an eliminated candidate", () => {
      store.insert({
        candidateId: "cand-001",
        positionName: "前端开发",
        reason: "经验不足",
        platformReplied: false,
      });
      expect(store.isEliminated("cand-001")).toBe(true);
    });
  });

  describe("listAll", () => {
    it("returns empty array when no records exist", () => {
      expect(store.listAll()).toEqual([]);
    });

    it("returns all elimination records", () => {
      // Seed a second candidate
      db.prepare(
        `INSERT INTO candidates (id, name, profile_url, raw_profile)
         VALUES ('cand-002', '李四', 'https://example.com/lisi', '{}')`
      ).run();

      store.insert({
        candidateId: "cand-001",
        positionName: "前端开发",
        reason: "经验不足",
        platformReplied: false,
      });
      store.insert({
        candidateId: "cand-002",
        positionName: "后端开发",
        reason: "薪资不匹配",
        platformReplied: true,
      });

      const all = store.listAll();
      expect(all).toHaveLength(2);
      expect(all[0].candidateId).toBe("cand-001");
      expect(all[1].candidateId).toBe("cand-002");
    });

    it("includes all fields with correct types", () => {
      store.insert({
        candidateId: "cand-001",
        positionName: "前端开发",
        reason: "经验不足",
        templateUsed: "experience_mismatch",
        platformReplied: false,
      });
      const [record] = store.listAll();
      expect(record.id).toBeGreaterThan(0);
      expect(record.candidateId).toBe("cand-001");
      expect(record.positionName).toBe("前端开发");
      expect(record.reason).toBe("经验不足");
      expect(record.templateUsed).toBe("experience_mismatch");
      expect(record.platformReplied).toBe(false);
      expect(record.eliminatedAt).toBeDefined();
    });
  });

  describe("updatePlatformReplied", () => {
    it("updates platform_replied from false to true", () => {
      const id = store.insert({
        candidateId: "cand-001",
        positionName: "前端开发",
        platformReplied: false,
      });
      store.updatePlatformReplied(id, true);
      const all = store.listAll();
      expect(all[0].platformReplied).toBe(true);
    });

    it("updates platform_replied from true to false", () => {
      const id = store.insert({
        candidateId: "cand-001",
        positionName: "前端开发",
        platformReplied: true,
      });
      store.updatePlatformReplied(id, false);
      const all = store.listAll();
      expect(all[0].platformReplied).toBe(false);
    });
  });
});

describe("ResultStore with eliminated status", () => {
  let db: Database.Database;
  let store: ResultStore;
  const matchDetails: MatchDetails = {
    requiredMatched: [],
    preferredMatched: [],
    totalScore: 0,
    threshold: 50,
  };

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new ResultStore(db);
    db.prepare(
      `INSERT INTO candidates (id, name, profile_url, raw_profile)
       VALUES ('cand-001', '张三', 'https://example.com/zhangsan', '{}')`
    ).run();
  });

  it("inserts a screening result with eliminated status", () => {
    const id = store.insert({
      candidateId: "cand-001",
      positionName: "前端开发",
      status: "eliminated",
      score: 0,
      matchDetails,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("updates status to eliminated", () => {
    store.insert({
      candidateId: "cand-001",
      positionName: "前端开发",
      status: "pending",
      score: 50,
      matchDetails,
    });
    store.updateStatus("cand-001", "前端开发", "eliminated");
    const results = store.getByStatus("eliminated");
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("eliminated");
  });

  it("returns eliminated results via getByStatus", () => {
    store.insert({
      candidateId: "cand-001",
      positionName: "前端开发",
      status: "eliminated",
      score: 0,
      matchDetails,
    });
    const results = store.getByStatus("eliminated");
    expect(results).toHaveLength(1);
    expect(results[0].candidateId).toBe("cand-001");
  });
});
