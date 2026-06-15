import type { EmailTransport } from "./types.js";
import type { EmailLogStore } from "../store/email-log.js";
import type { ResultStore } from "../store/results.js";
import type { CandidateStore } from "../store/candidates.js";
import type { EmailConfig } from "../types/index.js";
import { buildEmailSubject, buildEmailBody } from "./template.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("email-sender");

export class EmailSender {
  constructor(
    private transport: EmailTransport,
    private emailLog: EmailLogStore,
    private resultStore: ResultStore,
    private candidateStore: CandidateStore,
    private config: EmailConfig,
  ) {}

  async sendPending(positionName: string): Promise<number> {
    const results = this.resultStore.getPassedWithoutSent(
      positionName,
      (cid) => this.emailLog.hasSent(cid, positionName),
    );

    let sent = 0;
    for (const result of results) {
      const candidate = this.candidateStore.getById(result.candidateId);
      if (!candidate) {
        log.warn(`Candidate ${result.candidateId} not found in store, skipping`);
        continue;
      }

      try {
        const subject = buildEmailSubject(result, candidate.name);
        const html = buildEmailBody(candidate, result);

        const { messageId } = await this.transport.sendMail({
          to: this.config.to,
          subject,
          html,
        });

        this.emailLog.insert({
          candidateId: result.candidateId,
          positionName,
          direction: "sent",
          messageId,
          subject,
          body: html,
          statusUpdated: false,
        });

        sent++;
        log.info(`Sent email for ${candidate.name} (messageId: ${messageId})`);
      } catch (err) {
        log.error(`Failed to send email for ${candidate.name}: ${err}`);
      }
    }

    if (sent > 0) log.info(`Sent ${sent} email(s) this round`);
    return sent;
  }
}
