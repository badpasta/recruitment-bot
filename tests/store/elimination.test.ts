import { describe, it, expect, beforeEach } from "vitest";
import { initDatabase } from "../../src/store/db.js";
import { EliminationStore } from "../../src/store/elimination.js";

describe("EliminationStore", () => {
  let db: ReturnType<typeof initDatabase>;
  let store: EliminationStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new EliminationStore(db);

    // Seed a candidate
    db.exec(
      `INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', '张三', '', '{}')`,
    );
    db.exec(
      `INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c2', '李四', '', '{}')`,
    );
  });

  it("inserts an elimination record", () => {
    const id = store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      reason: "淘汰",
      templateUsed: "模板A",
      platformReplied: false,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("checks if a candidate has been eliminated", () => {
    expect(store.isEliminated("c1", "运维工程师")).toBe(false);

    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      reason: "淘汰",
      platformReplied: false,
    });

    expect(store.isEliminated("c1", "运维工程师")).toBe(true);
  });

  it("updates platform_replied status", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      reason: "淘汰",
      platformReplied: false,
    });

    store.updatePlatformReplied("c1", "运维工程师", true);

    const entry = store.getEntry("c1", "运维工程师");
    expect(entry).not.toBeNull();
    expect(entry!.platformReplied).toBe(true);
  });

  it("gets entry by candidate and position", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      reason: "淘汰",
      templateUsed: "模板A",
      platformReplied: true,
    });

    const entry = store.getEntry("c1", "运维工程师");
    expect(entry).not.toBeNull();
    expect(entry!.candidateId).toBe("c1");
    expect(entry!.positionName).toBe("运维工程师");
    expect(entry!.reason).toBe("淘汰");
    expect(entry!.templateUsed).toBe("模板A");
    expect(entry!.platformReplied).toBe(true);
  });

  it("returns null for non-existent entry", () => {
    const entry = store.getEntry("nonexistent", "运维工程师");
    expect(entry).toBeNull();
  });

  it("lists all elimination entries", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      reason: "淘汰",
      platformReplied: false,
    });
    store.insert({
      candidateId: "c2",
      positionName: "运维工程师",
      reason: "不合适",
      platformReplied: true,
    });

    const all = store.listAll();
    expect(all.length).toBe(2);
  });

  it("prevents duplicate elimination (unique constraint)", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      reason: "淘汰",
      platformReplied: false,
    });

    expect(() =>
      store.insert({
        candidateId: "c1",
        positionName: "运维工程师",
        reason: "淘汰",
        platformReplied: false,
      }),
    ).toThrow();
  });
});
