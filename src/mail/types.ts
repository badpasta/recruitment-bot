import type { Logger } from "../utils/logger.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  tls?: boolean;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface ParsedEmail {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  date: Date;
  text?: string;
  html?: string;
  attachments: ParsedAttachment[];
}

export interface ParsedAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}
