import type Database from "better-sqlite3";
import type { InterviewCandidate, InterviewScheduleStatus } from "../types/index.js";

interface CandidateRow {
  id: number;
  candidate_id: string;
  position_name: string;
  schedule_status: string;
  resume_summary: string | null;
  created_at: string;
  updated_at: string;
}

export class InterviewCandidateStore {
  constructor(private db: Database.Database) {}

  insert(candidate: InterviewCandidate): number {
    const stmt = this.db.prepare(`
      INSERT INTO interview_candidates (candidate_id, position_name, schedule_status, resume_summary)
      VALUES (@candidateId, @positionName, @scheduleStatus, @resumeSummary)
    `);
    const info = stmt.run({
      candidateId: candidate.candidateId,
      positionName: candidate.positionName,
      scheduleStatus: candidate.scheduleStatus,
      resumeSummary: candidate.resumeSummary ?? null,
    });
    return info.lastInsertRowid as number;
  }

  getByStatus(status: InterviewScheduleStatus): InterviewCandidate[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM interview_candidates WHERE schedule_status = ? ORDER BY created_at DESC",
      )
      .all(status) as CandidateRow[];
    return rows.map((row) => this.rowToCandidate(row));
  }

  getByCandidateAndPosition(candidateId: string, positionName: string): InterviewCandidate | null {
    const row = this.db
      .prepare(
        "SELECT * FROM interview_candidates WHERE candidate_id = ? AND position_name = ?",
      )
      .get(candidateId, positionName) as CandidateRow | undefined;
    if (!row) return null;
    return this.rowToCandidate(row);
  }

  updateStatus(
    candidateId: string,
    positionName: string,
    status: InterviewScheduleStatus,
  ): void {
    this.db
      .prepare(`
        UPDATE interview_candidates
        SET schedule_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE candidate_id = ? AND position_name = ?
      `)
      .run(status, candidateId, positionName);
  }

  updateResumeSummary(
    candidateId: string,
    positionName: string,
    resumeSummary: string,
  ): void {
    this.db
      .prepare(`
        UPDATE interview_candidates
        SET resume_summary = ?, updated_at = CURRENT_TIMESTAMP
        WHERE candidate_id = ? AND position_name = ?
      `)
      .run(resumeSummary, candidateId, positionName);
  }

  listAll(): InterviewCandidate[] {
    const rows = this.db
      .prepare("SELECT * FROM interview_candidates ORDER BY created_at DESC")
      .all() as CandidateRow[];
    return rows.map((row) => this.rowToCandidate(row));
  }

  private rowToCandidate(row: CandidateRow): InterviewCandidate {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      scheduleStatus: row.schedule_status as InterviewScheduleStatus,
      resumeSummary: row.resume_summary ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
