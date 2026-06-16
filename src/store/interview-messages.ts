import type Database from "better-sqlite3";
import type { InterviewMessage, InterviewMessageDirection } from "../types/index.js";

interface MessageRow {
  id: number;
  candidate_id: string;
  position_name: string;
  direction: string;
  content: string;
  created_at: string;
}

export class InterviewMessageStore {
  constructor(private db: Database.Database) {}

  insert(message: InterviewMessage): number {
    const stmt = this.db.prepare(`
      INSERT INTO interview_messages (candidate_id, position_name, direction, content)
      VALUES (@candidateId, @positionName, @direction, @content)
    `);
    const info = stmt.run({
      candidateId: message.candidateId,
      positionName: message.positionName,
      direction: message.direction,
      content: message.content,
    });
    return info.lastInsertRowid as number;
  }

  getByCandidateAndPosition(candidateId: string, positionName: string): InterviewMessage[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM interview_messages WHERE candidate_id = ? AND position_name = ? ORDER BY id DESC",
      )
      .all(candidateId, positionName) as MessageRow[];
    return rows.map((row) => this.rowToMessage(row));
  }

  getRecent(candidateId: string, positionName: string, limit: number): InterviewMessage[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM interview_messages WHERE candidate_id = ? AND position_name = ? ORDER BY id DESC LIMIT ?",
      )
      .all(candidateId, positionName, limit) as MessageRow[];
    return rows.map((row) => this.rowToMessage(row));
  }

  private rowToMessage(row: MessageRow): InterviewMessage {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      direction: row.direction as InterviewMessageDirection,
      content: row.content,
      createdAt: row.created_at,
    };
  }
}
