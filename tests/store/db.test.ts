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
    expect(names).toContain("interview_candidates");
    expect(names).toContain("interview_schedule");
    expect(names).toContain("interview_messages");
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

  it("interview_candidates table has correct columns and constraints", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(interview_candidates)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("candidate_id");
    expect(cols).toContain("position_name");
    expect(cols).toContain("schedule_status");
    expect(cols).toContain("resume_summary");
  });

  it("interview_schedule table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(interview_schedule)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("candidate_id");
    expect(cols).toContain("position_name");
    expect(cols).toContain("interview_time");
    expect(cols).toContain("meeting_link");
    expect(cols).toContain("calendar_event_id");
    expect(cols).toContain("status");
  });

  it("interview_messages table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(interview_messages)").all() as { name: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("candidate_id");
    expect(cols).toContain("position_name");
    expect(cols).toContain("direction");
    expect(cols).toContain("content");
  });

  it("screening_results accepts 'interview' status after migration", () => {
    db = initDatabase(":memory:");
    db.exec("INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', 'Test', 'https://x.com', '{}')");
    expect(() =>
      db.exec("INSERT INTO screening_results (candidate_id, position_name, status, score, match_details) VALUES ('c1', 'P1', 'interview', 0, '{}')")
    ).not.toThrow();
  });

  it("screening_results migration includes all five statuses", () => {
    db = initDatabase(":memory:");
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='screening_results'").get() as { sql: string };
    expect(sql.sql).toContain("'passed'");
    expect(sql.sql).toContain("'rejected'");
    expect(sql.sql).toContain("'pending'");
    expect(sql.sql).toContain("'eliminated'");
    expect(sql.sql).toContain("'interview'");
  });
});
