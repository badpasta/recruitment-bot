import type Database from "better-sqlite3";
import type { EliminationLogEntry } from "../types/index.js";

interface EliminationRow {
  id: number;
  candidate_id: string;
  position_name: string;
  reason: string;
  template_used: string | null;
  platform_replied: number;
  eliminated_at: string;
}

export class EliminationStore {
  constructor(private db: Database.Database) {}

  insert(entry: EliminationLogEntry): number {
    const stmt = this.db.prepare(`
      INSERT INTO elimination_log (candidate_id, position_name, reason, template_used, platform_replied)
      VALUES (@candidateId, @positionName, @reason, @templateUsed, @platformReplied)
    `);
    const info = stmt.run({
      candidateId: entry.candidateId,
      positionName: entry.positionName,
      reason: entry.reason,
      templateUsed: entry.templateUsed ?? null,
      platformReplied: entry.platformReplied ? 1 : 0,
    });
    return info.lastInsertRowid as number;
  }

  isEliminated(candidateId: string, positionName: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM elimination_log WHERE candidate_id = ? AND position_name = ?")
      .get(candidateId, positionName);
    return !!row;
  }

  updatePlatformReplied(candidateId: string, positionName: string, replied: boolean): void {
    this.db
      .prepare(`
        UPDATE elimination_log
        SET platform_replied = ?
        WHERE candidate_id = ? AND position_name = ?
      `)
      .run(replied ? 1 : 0, candidateId, positionName);
  }

  getEntry(candidateId: string, positionName: string): EliminationLogEntry | null {
    const row = this.db
      .prepare("SELECT * FROM elimination_log WHERE candidate_id = ? AND position_name = ?")
      .get(candidateId, positionName) as EliminationRow | undefined;
    if (!row) return null;
    return this.rowToEntry(row);
  }

  listAll(): EliminationLogEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM elimination_log ORDER BY eliminated_at DESC")
      .all() as EliminationRow[];
    return rows.map((row) => this.rowToEntry(row));
  }

  private rowToEntry(row: EliminationRow): EliminationLogEntry {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      reason: row.reason,
      templateUsed: row.template_used ?? undefined,
      platformReplied: row.platform_replied === 1,
      eliminatedAt: row.eliminated_at,
    };
  }
}
