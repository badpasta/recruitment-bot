import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "<abc@mail.test>", accepted: ["to@test.com"], rejected: [] });
const mockVerify = vi.fn().mockResolvedValue(true);

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
    })),
  },
}));

import nodemailer from "nodemailer";
import { EmailSender } from "../../src/mail/sender.js";
import type { SmtpConfig, SendOptions } from "../../src/mail/types.js";

const config: SmtpConfig = { host: "smtp.test.com", port: 587, user: "user", pass: "pass" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmailSender", () => {
  describe("constructor", () => {
    it("creates a transporter with the given SMTP config", () => {
      new EmailSender(config);
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: "smtp.test.com",
        port: 587,
        secure: false,
        auth: { user: "user", pass: "pass" },
      });
    });

    it("passes secure:true when config.secure is true", () => {
      new EmailSender({ ...config, secure: true });
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true }),
      );
    });
  });

  describe("send", () => {
    it("calls transporter.sendMail with from, to, subject, html", async () => {
      const sender = new EmailSender(config);
      await sender.send({ to: "to@test.com", subject: "Subj", html: "<p>Hi</p>" });
      expect(mockSendMail).toHaveBeenCalledWith({
        from: config.user,
        to: "to@test.com",
        subject: "Subj",
        html: "<p>Hi</p>",
      });
    });

    it("accepts multiple recipients", async () => {
      const sender = new EmailSender(config);
      await sender.send({ to: ["a@x.com", "b@x.com"], subject: "Multi" });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: ["a@x.com", "b@x.com"] }),
      );
    });

    it("passes text body when provided", async () => {
      const sender = new EmailSender(config);
      await sender.send({ to: "to@test.com", subject: "Subj", text: "plain" });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ text: "plain" }),
      );
    });

    it("passes attachments when provided", async () => {
      const sender = new EmailSender(config);
      const attachments = [{ filename: "a.pdf", content: Buffer.from("x") }];
      await sender.send({ to: "to@test.com", subject: "Subj", attachments });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ attachments }),
      );
    });

    it("resolves with the send result", async () => {
      const sender = new EmailSender(config);
      const result = await sender.send({ to: "to@test.com", subject: "Subj" });
      expect(result.messageId).toBe("<abc@mail.test>");
    });
  });

  describe("verify", () => {
    it("calls transporter.verify and returns true on success", async () => {
      const sender = new EmailSender(config);
      const ok = await sender.verify();
      expect(mockVerify).toHaveBeenCalled();
      expect(ok).toBe(true);
    });

    it("returns false when verify rejects", async () => {
      mockVerify.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
      const sender = new EmailSender(config);
      const ok = await sender.verify();
      expect(ok).toBe(false);
    });
  });
});
