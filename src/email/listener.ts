import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailConfig, ReplyAction } from "../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("email-listener");

/** Keywords that trigger status changes */
const KEYWORDS: Record<string, ReplyAction> = {
  "约面试": "interview",
  "淘汰": "eliminated",
};

/**
 * Parsed data from a reply email.
 */
export interface ParsedReply {
  messageId: string;
  inReplyTo: string | null;
  subject: string;
  textBody: string;
  action: ReplyAction;
}

/**
 * Parse a reply action from email body text.
 */
export function parseReplyAction(text: string): ReplyAction {
  const normalized = text.toLowerCase();
  for (const [keyword, action] of Object.entries(KEYWORDS)) {
    if (normalized.includes(keyword.toLowerCase())) {
      return action;
    }
  }
  return "unknown";
}

export class EmailListener {
  private config: EmailConfig;
  private client: ImapFlow | null = null;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  /**
   * Connect to the IMAP server.
   */
  async connect(): Promise<void> {
    this.client = new ImapFlow({
      host: this.config.imap.host,
      port: this.config.imap.port,
      secure: this.config.imap.secure,
      auth: {
        user: this.config.imap.user,
        pass: this.config.imap.pass,
      },
      logger: false,
    });

    await this.client.connect();
    log.info("IMAP connected");
  }

  /**
   * Check for new reply emails and return parsed replies.
   * Looks for unseen emails that are replies (have In-Reply-To header or Re: subject).
   */
  async checkReplies(): Promise<ParsedReply[]> {
    if (!this.client || !this.client.authenticated) {
      await this.connect();
    }

    const replies: ParsedReply[] = [];

    const lock = await this.client!.getMailboxLock("INBOX");
    try {
      // Search for unseen messages
      const uids = await this.client!.search({ seen: false });
      if (!uids || uids.length === 0) {
        return replies;
      }

      for await (const message of this.client!.fetch(uids, {
        source: true,
        flags: true,
      })) {
        if (!message.source) continue;

        try {
          const parsed = await simpleParser(message.source);
          const subject = parsed.subject ?? "";
          const inReplyTo = parsed.inReplyTo ?? null;
          const messageId = parsed.messageId ?? "";

          // Only process replies (have In-Reply-To or Re: prefix)
          const isReply = inReplyTo !== null || subject.toLowerCase().startsWith("re:");
          if (!isReply) continue;

          // Extract text body
          const textBody = parsed.text ?? "";
          const action = parseReplyAction(textBody);

          replies.push({
            messageId,
            inReplyTo,
            subject,
            textBody,
            action,
          });

          // Mark as seen
          await this.client!.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
        } catch (err) {
          log.error(`Failed to parse email UID ${message.uid}: ${err}`);
        }
      }
    } finally {
      lock.release();
    }

    if (replies.length > 0) {
      log.info(`Found ${replies.length} reply email(s)`);
    }

    return replies;
  }

  /**
   * Disconnect from the IMAP server.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // ignore errors during disconnect
      }
      this.client = null;
      log.info("IMAP disconnected");
    }
  }
}
