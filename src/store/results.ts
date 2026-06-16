import type Database from "better-sqlite3";
import type { ScreeningResult, ScreeningStatus } from "../types/index.js";

interface ResultRow {
  id: number;
  candidate_id: string;
  position_name: string;
  status: string;
  score: number;
  match_details: string;
  screened_at: string;
  email_notified_at: string | null;
}

function rowToResult(row: ResultRow): ScreeningResult {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    positionName: row.position_name,
    status: row.status as ScreeningStatus,
    score: row.score,
    matchDetails: JSON.parse(row.match_details),
    screenedAt: row.screened_at,
    emailNotifiedAt: row.email_notified_at ?? undefined,
  };
}

export class ResultStore {
  constructor(private db: Database.Database) {}

  insert(result: ScreeningResult): number {
    const stmt = this.db.prepare(`
      INSERT INTO screening_results (candidate_id, position_name, status, score, match_details)
      VALUES (@candidateId, @positionName, @status, @score, @matchDetails)
    `);
    const info = stmt.run({
      candidateId: result.candidateId,
      positionName: result.positionName,
      status: result.status,
      score: result.score,
      matchDetails: JSON.stringify(result.matchDetails),
    });
    return info.lastInsertRowid as number;
  }

  getByStatus(status: ScreeningStatus): ScreeningResult[] {
    const rows = this.db
      .prepare("SELECT * FROM screening_results WHERE status = ? ORDER BY screened_at DESC")
      .all(status) as ResultRow[];
    return rows.map(rowToResult);
  }

  updateStatus(candidateId: string, positionName: string, status: ScreeningStatus): void {
    this.db
      .prepare(`
        UPDATE screening_results
        SET status = ?, screened_at = CURRENT_TIMESTAMP
        WHERE candidate_id = ? AND position_name = ?
      `)
      .run(status, candidateId, positionName);
  }

  /**
   * Get passed results that have not been emailed yet (email_notified_at IS NULL).
   */
  getPassedNotNotified(): ScreeningResult[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM screening_results
        WHERE status = 'passed' AND email_notified_at IS NULL
        ORDER BY screened_at ASC
      `)
      .all() as ResultRow[];
    return rows.map(rowToResult);
  }

  /**
   * Mark a screening result as email-notified.
   */
  markEmailNotified(id: number): void {
    this.db
      .prepare(`
        UPDATE screening_results
        SET email_notified_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(id);
  }

  /**
   * Update status by row ID (used when processing reply emails).
   */
  updateStatusById(id: number, status: ScreeningStatus): void {
    this.db
      .prepare(`
        UPDATE screening_results
        SET status = ?, screened_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(status, id);
  }

  /**
   * Get a single result by row ID.
   */
  getById(id: number): ScreeningResult | null {
    const row = this.db
      .prepare("SELECT * FROM screening_results WHERE id = ?")
      .get(id) as ResultRow | undefined;
    if (!row) return null;
    return rowToResult(row);
  }
}
