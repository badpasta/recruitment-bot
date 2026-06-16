import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("store");

export function initDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      raw_profile JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS screening_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('passed', 'rejected', 'pending', 'eliminated', 'interview')),
      score INTEGER NOT NULL DEFAULT 0,
      match_details JSON NOT NULL,
      screened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      email_notified_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS run_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS elimination_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      reason TEXT,
      template_used TEXT,
      platform_replied INTEGER NOT NULL DEFAULT 0,
      eliminated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interview_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      interview_type TEXT NOT NULL CHECK(interview_type IN ('phone', 'video', 'onsite')),
      scheduled_at DATETIME NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('scheduled', 'completed', 'cancelled', 'no_show')) DEFAULT 'scheduled',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interview_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      interview_event_id INTEGER NOT NULL REFERENCES interview_events(id),
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      dimensions JSON NOT NULL,
      overall_comment TEXT NOT NULL,
      recommended INTEGER NOT NULL DEFAULT 0,
      interviewer_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS strategy_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content JSON NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
      related_feedback_ids JSON NOT NULL DEFAULT '[]',
      priority INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interview_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      schedule_status TEXT NOT NULL CHECK(schedule_status IN ('waiting_time', 'time_proposed', 'confirmed', 'scheduled', 'cancelled')) DEFAULT 'waiting_time',
      resume_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(candidate_id, position_name)
    );

    CREATE TABLE IF NOT EXISTS interview_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      interview_time DATETIME,
      meeting_link TEXT,
      calendar_event_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('waiting_time', 'time_proposed', 'confirmed', 'scheduled', 'cancelled')) DEFAULT 'waiting_time',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(candidate_id, position_name)
    );

    CREATE TABLE IF NOT EXISTS interview_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sent_emails (
      message_id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      result_id INTEGER REFERENCES screening_results(id),
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS processed_replies (
      message_id TEXT PRIMARY KEY,
      in_reply_to TEXT,
      candidate_id TEXT,
      action TEXT,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_screening_results_status
      ON screening_results(status);

    CREATE INDEX IF NOT EXISTS idx_screening_results_candidate
      ON screening_results(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_elimination_log_candidate
      ON elimination_log(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_interview_events_candidate
      ON interview_events(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_interview_events_status
      ON interview_events(status);

    CREATE INDEX IF NOT EXISTS idx_interview_feedback_candidate
      ON interview_feedback(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_interview_feedback_event
      ON interview_feedback(interview_event_id);

    CREATE INDEX IF NOT EXISTS idx_strategy_suggestions_status
      ON strategy_suggestions(status);

    CREATE INDEX IF NOT EXISTS idx_interview_candidates_status
      ON interview_candidates(schedule_status);

    CREATE INDEX IF NOT EXISTS idx_interview_candidates_candidate
      ON interview_candidates(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_interview_schedule_candidate
      ON interview_schedule(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_interview_schedule_status
      ON interview_schedule(status);

    CREATE INDEX IF NOT EXISTS idx_interview_schedule_time
      ON interview_schedule(interview_time);

    CREATE INDEX IF NOT EXISTS idx_interview_messages_candidate
      ON interview_messages(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_sent_emails_candidate
      ON sent_emails(candidate_id);
  `);

  // Migration: add email_notified_at to existing screening_results table
  const columns = db.prepare("PRAGMA table_info(screening_results)").all() as { name: string }[];
  if (!columns.some(c => c.name === "email_notified_at")) {
    db.exec("ALTER TABLE screening_results ADD COLUMN email_notified_at DATETIME");
    log.info("Migration: added email_notified_at column to screening_results");
  }

  // Migration: upgrade screening_results CHECK constraint to include 'eliminated' and 'interview'
  const screeningSQL = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='screening_results'")
    .get() as { sql: string } | undefined;
  if (screeningSQL && !screeningSQL.sql.includes("'interview'")) {
    db.exec(`
      ALTER TABLE screening_results RENAME TO screening_results_old;

      CREATE TABLE screening_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL REFERENCES candidates(id),
        position_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('passed', 'rejected', 'pending', 'eliminated', 'interview')),
        score INTEGER NOT NULL DEFAULT 0,
        match_details JSON NOT NULL,
        screened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        email_notified_at DATETIME
      );

      INSERT INTO screening_results SELECT * FROM screening_results_old;
      DROP TABLE screening_results_old;

      CREATE INDEX IF NOT EXISTS idx_screening_results_status
        ON screening_results(status);
      CREATE INDEX IF NOT EXISTS idx_screening_results_candidate
        ON screening_results(candidate_id);
    `);
    log.info("Migrated screening_results to include 'eliminated' and 'interview' status");
  }

  log.info(`Database initialized at ${dbPath}`);
  return db;
}
