declare module "mailparser" {
  export function simpleParser(
    source: Buffer | string,
    options?: Record<string, unknown>,
  ): Promise<ParsedMail>;

  export interface ParsedMail {
    messageId?: string;
    from?: { text: string };
    to?: { text: string };
    subject?: string;
    date?: Date;
    text?: string;
    html?: string | false;
    attachments?: ParsedAttachment[];
  }

  export interface ParsedAttachment {
    filename?: string;
    content: Buffer;
    contentType: string;
  }
}
