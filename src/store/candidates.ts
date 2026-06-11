import type Database from "better-sqlite3";
import type { Candidate } from "../types/index.js";

interface CandidateRow {
  id: string;
  name: string;
  profile_url: string;
  raw_profile: string;
  created_at: string;
  updated_at: string;
}

export class CandidateStore {
  constructor(private db: Database.Database) {}

  upsert(candidate: Candidate): void {
    const stmt = this.db.prepare(`
      INSERT INTO candidates (id, name, profile_url, raw_profile, updated_at)
      VALUES (@id, @name, @profileUrl, @rawProfile, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        profile_url = excluded.profile_url,
        raw_profile = excluded.raw_profile,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run({
      id: candidate.id,
      name: candidate.name,
      profileUrl: candidate.profileUrl,
      rawProfile: JSON.stringify(candidate.rawProfile),
    });
  }

  getById(id: string): Candidate | null {
    const row = this.db
      .prepare("SELECT * FROM candidates WHERE id = ?")
      .get(id) as CandidateRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      profileUrl: row.profile_url,
      rawProfile: JSON.parse(row.raw_profile),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM candidates WHERE id = ?")
      .get(id);
    return row !== undefined;
  }
}
