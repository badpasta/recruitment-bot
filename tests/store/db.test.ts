import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";

describe("initDatabase", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it("creates all three tables", () => {
    db = initDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("candidates");
    expect(names).toContain("screening_results");
    expect(names).toContain("run_state");
  });

  it("candidates table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(candidates)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("profile_url");
    expect(cols).toContain("raw_profile");
  });
});
