import nodemailer from "nodemailer";
import type { EmailConfig, EmailNotificationData } from "../types/index.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("email-sender");

/**
 * Build the HTML email body for a passed candidate.
 */
export function buildEmailHtml(data: EmailNotificationData): string {
  const skillsList = data.skills.length > 0 ? data.skills.join(", ") : "无";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <h2 style="color: #1a73e8;">候选人筛选通知</h2>
  <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
    <tr style="background-color: #f5f5f5;">
      <td style="font-weight: bold; width: 120px;">候选人姓名</td>
      <td>${escapeHtml(data.candidateName)}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">应聘职位</td>
      <td>${escapeHtml(data.positionName)}</td>
    </tr>
    <tr style="background-color: #f5f5f5;">
      <td style="font-weight: bold;">匹配分数</td>
      <td><strong>${data.score}分</strong></td>
    </tr>
    <tr>
      <td style="font-weight: bold;">技能摘要</td>
      <td>${escapeHtml(skillsList)}</td>
    </tr>
    <tr style="background-color: #f5f5f5;">
      <td style="font-weight: bold;">Boss直聘主页</td>
      <td><a href="${escapeHtml(data.profileUrl)}" target="_blank">${escapeHtml(data.profileUrl)}</a></td>
    </tr>
  </table>
  <p style="color: #666; font-size: 12px; margin-top: 20px;">
    回复本邮件可驱动后续流程：<br>
    · 回复包含 <strong>"约面试"</strong> → 标记为约面试<br>
    · 回复包含 <strong>"淘汰"</strong> → 标记为淘汰
  </p>
</body>
</html>`.trim();
}

/**
 * Build the email subject for a passed candidate.
 */
export function buildEmailSubject(data: EmailNotificationData): string {
  return `[招聘筛选] ${data.positionName} - ${data.candidateName} (匹配度: ${data.score}分)`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class EmailSender {
  private transporter: nodemailer.Transporter;
  private from: string;
  private to: string;

  constructor(config: EmailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
    this.from = config.from;
    this.to = config.to;
  }

  /**
   * Send a notification email for a passed candidate.
   * Returns the Message-ID of the sent email.
   */
  async sendNotification(data: EmailNotificationData): Promise<string> {
    const subject = buildEmailSubject(data);
    const html = buildEmailHtml(data);

    const info = await this.transporter.sendMail({
      from: this.from,
      to: this.to,
      subject,
      html,
      headers: {
        "X-Candidate-ID": data.candidateId,
        "X-Position-Name": data.positionName,
        "X-Result-ID": String(data.resultId),
      },
    });

    const messageId = info.messageId;
    log.info(`Email sent: ${subject} [Message-ID: ${messageId}]`);
    return messageId;
  }

  /**
   * Verify SMTP connection is working.
   */
  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      log.info("SMTP connection verified");
      return true;
    } catch (err) {
      log.error(`SMTP verification failed: ${err}`);
      return false;
    }
  }

  close(): void {
    this.transporter.close();
  }
}
