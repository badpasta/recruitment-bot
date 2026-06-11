import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { RunStateStore } from "../../src/store/run-state.js";

describe("RunStateStore", () => {
  let db: Database.Database;
  let state: RunStateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    state = new RunStateStore(db);
  });

  afterEach(() => { db.close(); });

  it("sets and gets a value", () => {
    state.set("last_scan_time", "2026-06-11T10:00:00Z");
    expect(state.get("last_scan_time")).toBe("2026-06-11T10:00:00Z");
  });

  it("returns null for missing key", () => {
    expect(state.get("nonexistent")).toBeNull();
  });

  it("overwrites existing value", () => {
    state.set("error_count", "0");
    state.set("error_count", "3");
    expect(state.get("error_count")).toBe("3");
  });
});
