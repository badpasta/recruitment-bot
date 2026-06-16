import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ImapConfig, ParsedEmail } from "./types.js";

const FETCH_QUERY = { source: true, uid: true, envelope: true, internalDate: true } as const;

function toParsedEmail(parsed: Awaited<ReturnType<typeof simpleParser>>): ParsedEmail {
  return {
    messageId: parsed.messageId ?? "",
    from: parsed.from?.text ?? "",
    to: parsed.to?.text.split(/,\s*/) ?? [],
    subject: parsed.subject ?? "",
    date: parsed.date ?? new Date(0),
    text: parsed.text,
    html: parsed.html || undefined,
    attachments: (parsed.attachments ?? []).map((a) => ({
      filename: a.filename ?? "",
      content: a.content,
      contentType: a.contentType,
    })),
  };
}

export class EmailReceiver {
  private client: ImapFlow;

  constructor(config: ImapConfig) {
    this.client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.tls ?? false,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.logout();
  }

  async fetchLatest(count = 10): Promise<ParsedEmail[]> {
    const seqs = await this.client.search({ all: true });
    if (!seqs || seqs.length === 0) return [];

    const latest = seqs.slice(-count);
    return this.fetchMessages(latest);
  }

  async fetchSince(since: Date): Promise<ParsedEmail[]> {
    return this.fetchMessages({ since });
  }

  private async fetchMessages(
    range: number[] | { since: Date },
  ): Promise<ParsedEmail[]> {
    const messages = this.client.fetch(range, FETCH_QUERY);

    const results: ParsedEmail[] = [];
    for await (const msg of messages) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      results.push(toParsedEmail(parsed));
    }

    return results;
  }
}
