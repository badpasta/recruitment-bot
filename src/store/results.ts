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
    return rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      status: row.status as ScreeningStatus,
      score: row.score,
      matchDetails: JSON.parse(row.match_details),
      screenedAt: row.screened_at,
    }));
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
}
