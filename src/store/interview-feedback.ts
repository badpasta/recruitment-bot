import type Database from "better-sqlite3";
import type { InterviewFeedback } from "../types/index.js";

interface InterviewFeedbackRow {
  id: number;
  interview_event_id: number;
  candidate_id: string;
  dimensions: string;
  overall_comment: string;
  recommended: number;
  interviewer_name: string;
  created_at: string;
}

export class InterviewFeedbackStore {
  constructor(private db: Database.Database) {}

  insert(feedback: InterviewFeedback): number {
    const stmt = this.db.prepare(`
      INSERT INTO interview_feedback (interview_event_id, candidate_id, dimensions, overall_comment, recommended, interviewer_name)
      VALUES (@interviewEventId, @candidateId, @dimensions, @overallComment, @recommended, @interviewerName)
    `);
    const info = stmt.run({
      interviewEventId: feedback.interviewEventId,
      candidateId: feedback.candidateId,
      dimensions: JSON.stringify(feedback.dimensions),
      overallComment: feedback.overallComment,
      recommended: feedback.recommended ? 1 : 0,
      interviewerName: feedback.interviewerName,
    });
    return info.lastInsertRowid as number;
  }

  getByCandidateId(candidateId: string): InterviewFeedback[] {
    const rows = this.db
      .prepare("SELECT * FROM interview_feedback WHERE candidate_id = ? ORDER BY created_at DESC")
      .all(candidateId) as InterviewFeedbackRow[];
    return rows.map(this.toInterviewFeedback);
  }

  getByEventId(eventId: number): InterviewFeedback[] {
    const rows = this.db
      .prepare("SELECT * FROM interview_feedback WHERE interview_event_id = ? ORDER BY created_at DESC")
      .all(eventId) as InterviewFeedbackRow[];
    return rows.map(this.toInterviewFeedback);
  }

  getByRecommended(recommended: boolean): InterviewFeedback[] {
    const rows = this.db
      .prepare("SELECT * FROM interview_feedback WHERE recommended = ? ORDER BY created_at DESC")
      .all(recommended ? 1 : 0) as InterviewFeedbackRow[];
    return rows.map(this.toInterviewFeedback);
  }

  getRecent(limit: number): InterviewFeedback[] {
    const rows = this.db
      .prepare("SELECT * FROM interview_feedback ORDER BY created_at DESC LIMIT ?")
      .all(limit) as InterviewFeedbackRow[];
    return rows.map(this.toInterviewFeedback);
  }

  private toInterviewFeedback(row: InterviewFeedbackRow): InterviewFeedback {
    return {
      id: row.id,
      interviewEventId: row.interview_event_id,
      candidateId: row.candidate_id,
      dimensions: JSON.parse(row.dimensions),
      overallComment: row.overall_comment,
      recommended: row.recommended === 1,
      interviewerName: row.interviewer_name,
      createdAt: row.created_at,
    };
  }
}
