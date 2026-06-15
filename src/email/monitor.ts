import type { ImapClient } from "./types.js";
import type { EmailLogStore } from "../store/email-log.js";
import type { ResultStore } from "../store/results.js";
import type { EmailConfig, ScreeningStatus } from "../types/index.js";
import { detectKeyword } from "./keywords.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("reply-monitor");

export class ReplyMonitor {
  constructor(
    private imapClient: ImapClient,
    private emailLog: EmailLogStore,
    private resultStore: ResultStore,
    private config: EmailConfig,
  ) {}

  async checkReplies(): Promise<number> {
    try {
      await this.imapClient.connect();
    } catch (err) {
      log.error(`IMAP connection failed: ${err}`);
      return 0;
    }

    try {
      const messages = await this.imapClient.fetchUnseen();
      let processed = 0;

      for (const msg of messages) {
        // Skip already-processed messages
        if (this.emailLog.hasReceivedMessage(msg.messageId)) {
          continue;
        }

        // Find the original sent email via In-Reply-To
        if (!msg.inReplyTo) {
          log.warn(`Email ${msg.messageId} has no In-Reply-To, skipping`);
          continue;
        }

        const original = this.emailLog.findByMessageId(msg.inReplyTo);
        if (!original || original.direction !== "sent") {
          log.warn(
            `Cannot match reply ${msg.messageId} to sent email ${msg.inReplyTo}`,
          );
          continue;
        }

        // Detect keyword
        const keyword = detectKeyword(msg.text, this.config.replyKeywords);

        // Update screening status if keyword matched
        let statusUpdated = false;
        if (keyword === "interview" || keyword === "eliminated") {
          this.resultStore.updateStatus(
            original.candidateId,
            original.positionName,
            keyword as ScreeningStatus,
          );
          statusUpdated = true;
          log.info(`Updated ${original.candidateId} status to '${keyword}'`);
        }

        // Log to email_log
        this.emailLog.insert({
          candidateId: original.candidateId,
          positionName: original.positionName,
          direction: "received",
          messageId: msg.messageId,
          inReplyTo: msg.inReplyTo,
          subject: msg.subject,
          body: msg.text,
          keywordDetected: keyword,
          statusUpdated,
        });

        // Mark as seen
        await this.imapClient.markSeen(msg.uid);
        processed++;
      }

      if (processed > 0) log.info(`Processed ${processed} reply(ies)`);
      return processed;
    } catch (err) {
      log.error(`Reply check failed: ${err}`);
      return 0;
    } finally {
      await this.imapClient.disconnect().catch(() => {});
    }
  }
}
