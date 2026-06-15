import nodemailer from "nodemailer";
import type { EmailTransport } from "./types.js";

export class NodemailerTransport implements EmailTransport {
  private transporter: nodemailer.Transporter;
  private fromAddress: string;

  constructor(
    smtpHost: string,
    smtpPort: number,
    smtpUser: string,
    password: string,
    fromName: string,
  ) {
    this.fromAddress = `"${fromName}" <${smtpUser}>`;
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: true,
      auth: { user: smtpUser, pass: password },
    });
  }

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return { messageId: info.messageId };
  }
}
