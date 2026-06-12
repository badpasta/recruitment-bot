import type { EmailConfig } from "../types/index.js";
import type { CandidateStore } from "../store/candidates.js";
import type { ResultStore } from "../store/results.js";
import type { EmailStore } from "../store/email-store.js";
import { EmailSender } from "./sender.js";
import { EmailListener, type ParsedReply } from "./listener.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("email");

/**
 * Orchestrates the email push + reply-driven workflow:
 * 1. Send notification emails for newly passed candidates
 * 2. Poll for reply emails and update screening statuses
 */
export class EmailOrchestrator {
  private sender: EmailSender;
  private listener: EmailListener;
  private candidateStore: CandidateStore;
  private resultStore: ResultStore;
  private emailStore: EmailStore;

  constructor(
    config: EmailConfig,
    candidateStore: CandidateStore,
    resultStore: ResultStore,
    emailStore: EmailStore,
  ) {
    this.sender = new EmailSender(config);
    this.listener = new EmailListener(config);
    this.candidateStore = candidateStore;
    this.resultStore = resultStore;
    this.emailStore = emailStore;
  }

  /**
   * Send notification emails for all passed candidates that haven't been emailed yet.
   */
  async sendPendingNotifications(): Promise<void> {
    const pending = this.resultStore.getPassedNotNotified();
    if (pending.length === 0) return;

    log.info(`Sending ${pending.length} pending notification email(s)...`);

    for (const result of pending) {
      const candidate = this.candidateStore.getById(result.candidateId);
      if (!candidate) {
        log.warn(`Candidate ${result.candidateId} not found, skipping`);
        continue;
      }

      try {
        const messageId = await this.sender.sendNotification({
          candidateName: candidate.name,
          positionName: result.positionName,
          score: result.score,
          skills: candidate.rawProfile.skills,
          profileUrl: candidate.profileUrl,
          candidateId: candidate.id,
          resultId: result.id!,
        });

        // Record sent email and mark result as notified
        this.emailStore.recordSentEmail({
          messageId,
          candidateId: candidate.id,
          positionName: result.positionName,
          resultId: result.id,
        });
        this.resultStore.markEmailNotified(result.id!);

        log.info(`✓ Notified: ${candidate.name} → ${result.positionName}`);
      } catch (err) {
        log.error(`Failed to send email for ${candidate.name}: ${err}`);
      }
    }
  }

  /**
   * Check for reply emails and update screening statuses.
   * Uses In-Reply-To header to match replies back to sent emails.
   */
  async processReplies(): Promise<void> {
    let replies: ParsedReply[];
    try {
      replies = await this.listener.checkReplies();
    } catch (err) {
      log.error(`Failed to check replies: ${err}`);
      return;
    }

    for (const reply of replies) {
      // Idempotency: skip already-processed replies
      if (this.emailStore.isReplyProcessed(reply.messageId)) {
        log.info(`Skipping already-processed reply: ${reply.messageId}`);
        continue;
      }

      // Match reply to a sent email via In-Reply-To header
      let candidateId: string | undefined;
      let resultId: number | undefined;

      if (reply.inReplyTo) {
        const sentEmail = this.emailStore.getSentByMessageId(reply.inReplyTo);
        if (sentEmail) {
          candidateId = sentEmail.candidateId;
          resultId = sentEmail.resultId;
        }
      }

      // Record the processed reply
      this.emailStore.recordProcessedReply({
        messageId: reply.messageId,
        inReplyTo: reply.inReplyTo ?? undefined,
        candidateId,
        action: reply.action,
      });

      // Update screening status if we found a match and a valid action
      if (candidateId && resultId && reply.action !== "unknown") {
        this.resultStore.updateStatusById(resultId, reply.action);
        log.info(`✓ Status updated: candidate=${candidateId} action=${reply.action}`);
      } else if (reply.action !== "unknown") {
        log.warn(`Reply ${reply.messageId} has action "${reply.action}" but could not match to a candidate`);
      }
    }
  }

  /**
   * Run one full email cycle: send notifications, then process replies.
   */
  async runCycle(): Promise<void> {
    await this.sendPendingNotifications();
    await this.processReplies();
  }

  /**
   * Clean up connections.
   */
  async shutdown(): Promise<void> {
    this.sender.close();
    await this.listener.disconnect();
  }
}
