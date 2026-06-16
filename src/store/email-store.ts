import type Database from "better-sqlite3";
import type { SentEmail, ProcessedReply } from "../types/index.js";

interface SentEmailRow {
  message_id: string;
  candidate_id: string;
  position_name: string;
  result_id: number | null;
  sent_at: string;
}

interface ProcessedReplyRow {
  message_id: string;
  in_reply_to: string | null;
  candidate_id: string | null;
  action: string | null;
  processed_at: string;
}

export class EmailStore {
  constructor(private db: Database.Database) {}

  /**
   * Record a sent email.
   */
  recordSentEmail(email: SentEmail): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO sent_emails (message_id, candidate_id, position_name, result_id)
      VALUES (@messageId, @candidateId, @positionName, @resultId)
    `).run({
      messageId: email.messageId,
      candidateId: email.candidateId,
      positionName: email.positionName,
      resultId: email.resultId ?? null,
    });
  }

  /**
   * Look up a sent email by its Message-ID.
   */
  getSentByMessageId(messageId: string): SentEmail | null {
    const row = this.db
      .prepare("SELECT * FROM sent_emails WHERE message_id = ?")
      .get(messageId) as SentEmailRow | undefined;
    if (!row) return null;
    return {
      messageId: row.message_id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      resultId: row.result_id ?? undefined,
      sentAt: row.sent_at,
    };
  }

  /**
   * Check if a reply has already been processed (idempotency).
   */
  isReplyProcessed(messageId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM processed_replies WHERE message_id = ?")
      .get(messageId);
    return row !== undefined;
  }

  /**
   * Record a processed reply.
   */
  recordProcessedReply(reply: ProcessedReply): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO processed_replies (message_id, in_reply_to, candidate_id, action)
      VALUES (@messageId, @inReplyTo, @candidateId, @action)
    `).run({
      messageId: reply.messageId,
      inReplyTo: reply.inReplyTo ?? null,
      candidateId: reply.candidateId ?? null,
      action: reply.action ?? null,
    });
  }

  /**
   * Get all sent emails for a candidate and position.
   */
  getSentByEmail(candidateId: string, positionName: string): SentEmail[] {
    const rows = this.db
      .prepare("SELECT * FROM sent_emails WHERE candidate_id = ? AND position_name = ? ORDER BY sent_at DESC")
      .all(candidateId, positionName) as SentEmailRow[];
    return rows.map((row) => ({
      messageId: row.message_id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      resultId: row.result_id ?? undefined,
      sentAt: row.sent_at,
    }));
  }
}
