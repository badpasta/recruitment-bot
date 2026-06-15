import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { ImapClient, ImapMessage } from "./types.js";

export class ImapFlowClient implements ImapClient {
  private client: ImapFlow;

  constructor(
    host: string,
    port: number,
    user: string,
    password: string,
  ) {
    this.client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass: password },
      logger: false,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async fetchUnseen(): Promise<ImapMessage[]> {
    const lock = await this.client.getMailboxLock("INBOX");
    try {
      const messages: ImapMessage[] = [];
      for await (const msg of this.client.fetch(
        { seen: false },
        {
          envelope: true,
          source: true,
        },
      )) {
        if (!msg.source) continue;
        const sourceBuf = Buffer.isBuffer(msg.source)
          ? msg.source
          : Buffer.from(msg.source as ArrayBuffer);
        const parsed: ParsedMail = await simpleParser(sourceBuf);
        messages.push({
          uid: msg.uid,
          messageId: parsed.messageId ?? "",
          inReplyTo: (parsed.inReplyTo as string) ?? "",
          subject: parsed.subject ?? "",
          text: parsed.text ?? "",
        });
      }
      return messages;
    } finally {
      lock.release();
    }
  }

  async markSeen(uid: number): Promise<void> {
    await this.client.messageFlagsAdd({ uid: uid }, ["\\Seen"]);
  }

  async disconnect(): Promise<void> {
    await this.client.logout().catch(() => {});
  }
}
