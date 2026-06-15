import type Database from "better-sqlite3";
import type { EmailLogEntry } from "../types/index.js";

interface EmailLogRow {
  id: number;
  candidate_id: string;
  position_name: string;
  direction: string;
  message_id: string | null;
  in_reply_to: string | null;
  subject: string | null;
  body: string | null;
  keyword_detected: string | null;
  status_updated: number;
  processed_at: string;
}

export class EmailLogStore {
  constructor(private db: Database.Database) {}

  insert(entry: EmailLogEntry): number {
    const stmt = this.db.prepare(`
      INSERT INTO email_log (candidate_id, position_name, direction, message_id, in_reply_to, subject, body, keyword_detected, status_updated)
      VALUES (@candidateId, @positionName, @direction, @messageId, @inReplyTo, @subject, @body, @keywordDetected, @statusUpdated)
    `);
    const info = stmt.run({
      candidateId: entry.candidateId,
      positionName: entry.positionName,
      direction: entry.direction,
      messageId: entry.messageId ?? null,
      inReplyTo: entry.inReplyTo ?? null,
      subject: entry.subject ?? null,
      body: entry.body ?? null,
      keywordDetected: entry.keywordDetected ?? null,
      statusUpdated: entry.statusUpdated ? 1 : 0,
    });
    return info.lastInsertRowid as number;
  }

  hasSent(candidateId: string, positionName: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM email_log WHERE candidate_id = ? AND position_name = ? AND direction = 'sent'",
      )
      .get(candidateId, positionName);
    return row !== undefined;
  }

  findByMessageId(messageId: string): EmailLogEntry | null {
    const row = this.db
      .prepare("SELECT * FROM email_log WHERE message_id = ?")
      .get(messageId) as EmailLogRow | undefined;
    if (!row) return null;
    return this.rowToEntry(row);
  }

  hasReceivedMessage(messageId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM email_log WHERE message_id = ? AND direction = 'received'",
      )
      .get(messageId);
    return row !== undefined;
  }

  private rowToEntry(row: EmailLogRow): EmailLogEntry {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      direction: row.direction as "sent" | "received",
      messageId: row.message_id ?? undefined,
      inReplyTo: row.in_reply_to ?? undefined,
      subject: row.subject ?? undefined,
      body: row.body ?? undefined,
      keywordDetected: row.keyword_detected ?? undefined,
      statusUpdated: row.status_updated === 1,
      processedAt: row.processed_at,
    };
  }
}
