import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";

describe("CandidateStore", () => {
  let db: Database.Database;
  let store: CandidateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new CandidateStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it("upserts a new candidate", () => {
    store.upsert({
      id: "abc123",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s"], status: "离职-随时到岗", workHistory: [], projectHistory: [] },
    });
    const found = store.getById("abc123");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("张三");
  });

  it("updates existing candidate on upsert", () => {
    store.upsert({
      id: "abc123", name: "张三", profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    store.upsert({
      id: "abc123", name: "张三", profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s", "docker"], workHistory: [], projectHistory: [] },
    });
    const found = store.getById("abc123");
    expect(found!.rawProfile.skills).toEqual(["k8s", "docker"]);
  });

  it("returns null for non-existent candidate", () => {
    expect(store.getById("nonexistent")).toBeNull();
  });

  it("checks if candidate exists", () => {
    expect(store.exists("abc123")).toBe(false);
    store.upsert({
      id: "abc123", name: "张三", profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: [], workHistory: [], projectHistory: [] },
    });
    expect(store.exists("abc123")).toBe(true);
  });
});
