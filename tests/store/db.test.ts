import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";

describe("initDatabase", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it("creates all four tables", () => {
    db = initDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("candidates");
    expect(names).toContain("screening_results");
    expect(names).toContain("run_state");
    expect(names).toContain("email_log");
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

  it("email_log table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(email_log)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("candidate_id");
    expect(cols).toContain("position_name");
    expect(cols).toContain("direction");
    expect(cols).toContain("message_id");
    expect(cols).toContain("in_reply_to");
    expect(cols).toContain("subject");
    expect(cols).toContain("body");
    expect(cols).toContain("keyword_detected");
    expect(cols).toContain("status_updated");
    expect(cols).toContain("processed_at");
  });

  it("screening_results accepts interview and eliminated status", () => {
    db = initDatabase(":memory:");
    db.exec(`INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', 'Test', '', '{}')`);
    db.exec(`INSERT INTO screening_results (candidate_id, position_name, status, score, match_details) VALUES ('c1', 'pos', 'interview', 0, '{}')`);
    db.exec(`INSERT INTO screening_results (candidate_id, position_name, status, score, match_details) VALUES ('c1', 'pos2', 'eliminated', 0, '{}')`);
    const rows = db.prepare("SELECT status FROM screening_results ORDER BY position_name").all() as { status: string }[];
    expect(rows.map((r) => r.status)).toEqual(["interview", "eliminated"]);
  });
});
