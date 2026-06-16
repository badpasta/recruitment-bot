import type Database from "better-sqlite3";
import type { InterviewCandidate } from "../types/index.js";
import { InterviewCandidateStore } from "../store/interview-candidates.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("intake");

/**
 * Intake module: detects candidates marked "interview" in screening_results
 * and inserts them into interview_candidates (dedup via UNIQUE INDEX).
 */
export class Intake {
  private candidateStore: InterviewCandidateStore;

  constructor(private db: Database.Database) {
    this.candidateStore = new InterviewCandidateStore(db);
  }

  /**
   * Scan screening_results for "interview" status candidates not yet in the pipeline.
   * Returns newly inserted candidates.
   */
  scan(): InterviewCandidate[] {
    const rows = this.db
      .prepare(
        `SELECT sr.candidate_id, sr.position_name, c.name
         FROM screening_results sr
         JOIN candidates c ON c.id = sr.candidate_id
         WHERE sr.status = 'interview'
         ORDER BY sr.screened_at ASC`,
      )
      .all() as Array<{ candidate_id: string; position_name: string; name: string }>;

    const newcomers: InterviewCandidate[] = [];

    for (const row of rows) {
      const exists = this.candidateStore.getByCandidateAndPosition(
        row.candidate_id,
        row.position_name,
      );
      if (exists) continue;

      this.candidateStore.insert({
        candidateId: row.candidate_id,
        positionName: row.position_name,
        scheduleStatus: "waiting_time",
      });

      const inserted = this.candidateStore.getByCandidateAndPosition(
        row.candidate_id,
        row.position_name,
      );
      if (inserted) {
        newcomers.push(inserted);
        log.info(`New interview candidate: ${row.name} for ${row.position_name}`);
      }
    }

    return newcomers;
  }
}
