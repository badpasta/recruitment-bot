import nodemailer from "nodemailer";
import type { SmtpConfig, SendOptions } from "./types.js";

export class EmailSender {
  private transporter: nodemailer.Transporter;

  constructor(private config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(options: SendOptions) {
    return this.transporter.sendMail({
      from: this.config.user,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
