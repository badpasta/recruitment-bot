import type Database from "better-sqlite3";
import type { InterviewSchedule, InterviewScheduleStatus } from "../types/index.js";

interface ScheduleRow {
  id: number;
  candidate_id: string;
  position_name: string;
  interview_time: string | null;
  meeting_link: string | null;
  calendar_event_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export class InterviewScheduleStore {
  constructor(private db: Database.Database) {}

  insert(schedule: InterviewSchedule): number {
    const stmt = this.db.prepare(`
      INSERT INTO interview_schedule (candidate_id, position_name, interview_time, meeting_link, calendar_event_id, status)
      VALUES (@candidateId, @positionName, @interviewTime, @meetingLink, @calendarEventId, @status)
    `);
    const info = stmt.run({
      candidateId: schedule.candidateId,
      positionName: schedule.positionName,
      interviewTime: schedule.interviewTime ?? null,
      meetingLink: schedule.meetingLink ?? null,
      calendarEventId: schedule.calendarEventId ?? null,
      status: schedule.status,
    });
    return info.lastInsertRowid as number;
  }

  getByCandidateAndPosition(candidateId: string, positionName: string): InterviewSchedule | null {
    const row = this.db
      .prepare(
        "SELECT * FROM interview_schedule WHERE candidate_id = ? AND position_name = ?",
      )
      .get(candidateId, positionName) as ScheduleRow | undefined;
    if (!row) return null;
    return this.rowToSchedule(row);
  }

  getByTimeRange(start: string, end: string): InterviewSchedule[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM interview_schedule WHERE interview_time BETWEEN ? AND ? ORDER BY interview_time ASC",
      )
      .all(start, end) as ScheduleRow[];
    return rows.map((row) => this.rowToSchedule(row));
  }

  getByStatus(status: InterviewScheduleStatus): InterviewSchedule[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM interview_schedule WHERE status = ? ORDER BY created_at DESC",
      )
      .all(status) as ScheduleRow[];
    return rows.map((row) => this.rowToSchedule(row));
  }

  updateSchedule(
    candidateId: string,
    positionName: string,
    updates: { interviewTime?: string; meetingLink?: string; calendarEventId?: string; status?: InterviewScheduleStatus },
  ): void {
    const sets: string[] = [];
    const params: Record<string, unknown> = { candidateId, positionName };

    if (updates.interviewTime !== undefined) {
      sets.push("interview_time = @interviewTime");
      params.interviewTime = updates.interviewTime;
    }
    if (updates.meetingLink !== undefined) {
      sets.push("meeting_link = @meetingLink");
      params.meetingLink = updates.meetingLink;
    }
    if (updates.calendarEventId !== undefined) {
      sets.push("calendar_event_id = @calendarEventId");
      params.calendarEventId = updates.calendarEventId;
    }
    if (updates.status !== undefined) {
      sets.push("status = @status");
      params.status = updates.status;
    }

    if (sets.length === 0) return;

    sets.push("updated_at = CURRENT_TIMESTAMP");
    const sql = `UPDATE interview_schedule SET ${sets.join(", ")} WHERE candidate_id = @candidateId AND position_name = @positionName`;
    this.db.prepare(sql).run(params);
  }

  updateStatus(
    candidateId: string,
    positionName: string,
    status: InterviewScheduleStatus,
  ): void {
    this.updateSchedule(candidateId, positionName, { status });
  }

  private rowToSchedule(row: ScheduleRow): InterviewSchedule {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      interviewTime: row.interview_time ?? undefined,
      meetingLink: row.meeting_link ?? undefined,
      calendarEventId: row.calendar_event_id ?? undefined,
      status: row.status as InterviewScheduleStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
