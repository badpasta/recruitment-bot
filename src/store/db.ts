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
      status TEXT NOT NULL CHECK(status IN ('passed', 'rejected', 'pending', 'interview', 'eliminated')),
      score INTEGER NOT NULL DEFAULT 0,
      match_details JSON NOT NULL,
      screened_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS run_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
      message_id TEXT UNIQUE,
      in_reply_to TEXT,
      subject TEXT,
      body TEXT,
      keyword_detected TEXT,
      status_updated INTEGER DEFAULT 0,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_screening_results_status
      ON screening_results(status);

    CREATE INDEX IF NOT EXISTS idx_screening_results_candidate
      ON screening_results(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_email_log_candidate
      ON email_log(candidate_id);

    CREATE INDEX IF NOT EXISTS idx_email_log_message_id
      ON email_log(message_id);

    CREATE TABLE IF NOT EXISTS elimination_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      template_used TEXT,
      platform_replied INTEGER NOT NULL DEFAULT 0,
      eliminated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_elimination_log_candidate
      ON elimination_log(candidate_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_elimination_log_unique
      ON elimination_log(candidate_id, position_name);
  `);

  // Migrate existing screening_results CHECK constraint if needed
  const schemaRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='screening_results'")
    .get() as { sql: string } | undefined;
  if (schemaRow && !schemaRow.sql.includes("'interview'")) {
    db.exec(`
      CREATE TABLE screening_results_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL REFERENCES candidates(id),
        position_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('passed', 'rejected', 'pending', 'interview', 'eliminated')),
        score INTEGER NOT NULL DEFAULT 0,
        match_details JSON NOT NULL,
        screened_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO screening_results_new SELECT * FROM screening_results;
      DROP TABLE screening_results;
      ALTER TABLE screening_results_new RENAME TO screening_results;
      CREATE INDEX IF NOT EXISTS idx_screening_results_status ON screening_results(status);
      CREATE INDEX IF NOT EXISTS idx_screening_results_candidate ON screening_results(candidate_id);
    `);
  }

  log.info(`Database initialized at ${dbPath}`);
  return db;
}
