import type Database from "better-sqlite3";
import type { EliminationRecord } from "../types/index.js";

interface EliminationRow {
  id: number;
  candidate_id: string;
  position_name: string;
  reason: string | null;
  template_used: string | null;
  platform_replied: number;
  eliminated_at: string;
}

export class EliminationStore {
  constructor(private db: Database.Database) {}

  /** Insert an elimination record and return its row id. */
  insert(record: EliminationRecord): number {
    const stmt = this.db.prepare(`
      INSERT INTO elimination_log (candidate_id, position_name, reason, template_used, platform_replied)
      VALUES (@candidateId, @positionName, @reason, @templateUsed, @platformReplied)
    `);
    const info = stmt.run({
      candidateId: record.candidateId,
      positionName: record.positionName,
      reason: record.reason ?? null,
      templateUsed: record.templateUsed ?? null,
      platformReplied: record.platformReplied ? 1 : 0,
    });
    return info.lastInsertRowid as number;
  }

  /** Return true if the candidate has at least one elimination record. */
  isEliminated(candidateId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM elimination_log WHERE candidate_id = ? LIMIT 1")
      .get(candidateId);
    return row !== undefined;
  }

  /** Return all elimination records. */
  listAll(): EliminationRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM elimination_log ORDER BY eliminated_at ASC")
      .all() as EliminationRow[];
    return rows.map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      reason: row.reason ?? undefined,
      templateUsed: row.template_used ?? undefined,
      platformReplied: row.platform_replied === 1,
      eliminatedAt: row.eliminated_at,
    }));
  }

  /** Update the platform_replied flag for a given record. */
  updatePlatformReplied(id: number, replied: boolean): void {
    this.db
      .prepare("UPDATE elimination_log SET platform_replied = ? WHERE id = ?")
      .run(replied ? 1 : 0, id);
  }
}
