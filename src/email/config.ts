import type { EmailConfig } from "../types/index.js";

/**
 * Load email configuration from environment variables.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS
 *   EMAIL_FROM, EMAIL_TO
 *
 * Optional:
 *   SMTP_SECURE (default: "true")
 *   IMAP_SECURE (default: "true")
 *   EMAIL_POLL_INTERVAL_MS (default: "60000")
 */
export function loadEmailConfig(): EmailConfig | null {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const imapHost = process.env.IMAP_HOST;
  const imapUser = process.env.IMAP_USER;
  const imapPass = process.env.IMAP_PASS;
  const from = process.env.EMAIL_FROM;
  const to = process.env.EMAIL_TO;

  // If any required var is missing, email is disabled
  if (!smtpHost || !smtpUser || !smtpPass || !imapHost || !imapUser || !imapPass || !from || !to) {
    return null;
  }

  return {
    smtp: {
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? "465", 10),
      secure: process.env.SMTP_SECURE !== "false",
      user: smtpUser,
      pass: smtpPass,
    },
    imap: {
      host: imapHost,
      port: parseInt(process.env.IMAP_PORT ?? "993", 10),
      secure: process.env.IMAP_SECURE !== "false",
      user: imapUser,
      pass: imapPass,
    },
    from,
    to,
    pollIntervalMs: parseInt(process.env.EMAIL_POLL_INTERVAL_MS ?? "60000", 10),
  };
}
