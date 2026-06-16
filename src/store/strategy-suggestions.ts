import type Database from "better-sqlite3";
import type { StrategySuggestion, SuggestionStatus } from "../types/index.js";

interface StrategySuggestionRow {
  id: number;
  content: string;
  status: string;
  related_feedback_ids: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export class StrategySuggestionStore {
  constructor(private db: Database.Database) {}

  insert(suggestion: StrategySuggestion): number {
    const stmt = this.db.prepare(`
      INSERT INTO strategy_suggestions (content, status, related_feedback_ids, priority)
      VALUES (@content, @status, @relatedFeedbackIds, @priority)
    `);
    const info = stmt.run({
      content: JSON.stringify(suggestion.content),
      status: suggestion.status,
      relatedFeedbackIds: JSON.stringify(suggestion.relatedFeedbackIds),
      priority: suggestion.priority,
    });
    return info.lastInsertRowid as number;
  }

  getByStatus(status: SuggestionStatus): StrategySuggestion[] {
    const rows = this.db
      .prepare("SELECT * FROM strategy_suggestions WHERE status = ? ORDER BY priority DESC")
      .all(status) as StrategySuggestionRow[];
    return rows.map(this.toStrategySuggestion);
  }

  getAll(): StrategySuggestion[] {
    const rows = this.db
      .prepare("SELECT * FROM strategy_suggestions ORDER BY priority DESC")
      .all() as StrategySuggestionRow[];
    return rows.map(this.toStrategySuggestion);
  }

  updateStatus(id: number, status: SuggestionStatus): void {
    this.db
      .prepare(`
        UPDATE strategy_suggestions
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(status, id);
  }

  private toStrategySuggestion(row: StrategySuggestionRow): StrategySuggestion {
    return {
      id: row.id,
      content: JSON.parse(row.content),
      status: row.status as SuggestionStatus,
      relatedFeedbackIds: JSON.parse(row.related_feedback_ids),
      priority: row.priority,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
