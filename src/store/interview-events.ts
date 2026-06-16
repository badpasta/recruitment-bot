import type Database from "better-sqlite3";
import type { InterviewEvent, InterviewEventStatus } from "../types/index.js";

interface InterviewEventRow {
  id: number;
  candidate_id: string;
  position_name: string;
  interview_type: string;
  scheduled_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class InterviewEventStore {
  constructor(private db: Database.Database) {}

  insert(event: InterviewEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO interview_events (candidate_id, position_name, interview_type, scheduled_at, status, notes)
      VALUES (@candidateId, @positionName, @interviewType, @scheduledAt, @status, @notes)
    `);
    const info = stmt.run({
      candidateId: event.candidateId,
      positionName: event.positionName,
      interviewType: event.interviewType,
      scheduledAt: event.scheduledAt,
      status: event.status,
      notes: event.notes ?? null,
    });
    return info.lastInsertRowid as number;
  }

  getByCandidateId(candidateId: string): InterviewEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM interview_events WHERE candidate_id = ? ORDER BY scheduled_at DESC")
      .all(candidateId) as InterviewEventRow[];
    return rows.map(this.toInterviewEvent);
  }

  getByStatus(status: InterviewEventStatus): InterviewEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM interview_events WHERE status = ? ORDER BY scheduled_at DESC")
      .all(status) as InterviewEventRow[];
    return rows.map(this.toInterviewEvent);
  }

  updateStatus(id: number, status: InterviewEventStatus): void {
    this.db
      .prepare(`
        UPDATE interview_events
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(status, id);
  }

  private toInterviewEvent(row: InterviewEventRow): InterviewEvent {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      interviewType: row.interview_type as InterviewEvent["interviewType"],
      scheduledAt: row.scheduled_at,
      status: row.status as InterviewEventStatus,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
