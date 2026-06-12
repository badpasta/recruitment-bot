import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";

describe("initDatabase", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it("creates all tables", () => {
    db = initDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("candidates");
    expect(names).toContain("screening_results");
    expect(names).toContain("run_state");
    expect(names).toContain("interview_events");
    expect(names).toContain("interview_feedback");
    expect(names).toContain("strategy_suggestions");
    expect(names).toContain("elimination_log");
    expect(names).toContain("sent_emails");
    expect(names).toContain("processed_replies");
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

  it("interview_events table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(interview_events)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("candidate_id");
    expect(cols).toContain("position_name");
    expect(cols).toContain("interview_type");
    expect(cols).toContain("scheduled_at");
    expect(cols).toContain("status");
  });

  it("interview_feedback table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(interview_feedback)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("interview_event_id");
    expect(cols).toContain("candidate_id");
    expect(cols).toContain("dimensions");
    expect(cols).toContain("overall_comment");
    expect(cols).toContain("recommended");
    expect(cols).toContain("interviewer_name");
  });

  it("strategy_suggestions table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(strategy_suggestions)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("content");
    expect(cols).toContain("status");
    expect(cols).toContain("related_feedback_ids");
    expect(cols).toContain("priority");
  });
});
