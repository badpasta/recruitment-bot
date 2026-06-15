import { describe, it, expect, beforeEach } from "vitest";
import { EmailSender } from "../../src/email/sender.js";
import type { EmailTransport } from "../../src/email/types.js";
import { initDatabase } from "../../src/store/db.js";
import { EmailLogStore } from "../../src/store/email-log.js";
import { ResultStore } from "../../src/store/results.js";
import { CandidateStore } from "../../src/store/candidates.js";
import type { EmailConfig, ScreeningResult } from "../../src/types/index.js";

class MockTransport implements EmailTransport {
  public sentMails: { to: string; subject: string; html: string }[] = [];
  public messageIdCounter = 0;

  async sendMail(options: { to: string; subject: string; html: string }) {
    this.sentMails.push(options);
    this.messageIdCounter++;
    return { messageId: `<mock-${this.messageIdCounter}@test>` };
  }
}

const EMAIL_CONFIG: EmailConfig = {
  smtpHost: "smtp.test.com",
  smtpPort: 465,
  smtpUser: "test@test.com",
  fromName: "Test",
  to: "boss@test.com",
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  replyKeywords: { interview: ["约面试"], eliminated: ["淘汰"] },
};

describe("EmailSender", () => {
  let db: ReturnType<typeof initDatabase>;
  let sender: EmailSender;
  let transport: MockTransport;
  let emailLog: EmailLogStore;
  let resultStore: ResultStore;
  let candidateStore: CandidateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    transport = new MockTransport();
    emailLog = new EmailLogStore(db);
    resultStore = new ResultStore(db);
    candidateStore = new CandidateStore(db);
    sender = new EmailSender(
      transport,
      emailLog,
      resultStore,
      candidateStore,
      EMAIL_CONFIG,
    );

    // Seed data
    candidateStore.upsert({
      id: "c1",
      name: "张三",
      profileUrl: "",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  it("sends email for passed candidate not yet emailed", async () => {
    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "passed",
      score: 20,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 20,
        threshold: 15,
      },
    };
    resultStore.insert(result);

    const sent = await sender.sendPending("运维工程师");
    expect(sent).toBe(1);
    expect(transport.sentMails.length).toBe(1);
    expect(transport.sentMails[0].to).toBe("boss@test.com");
    expect(transport.sentMails[0].subject).toContain("张三");
  });

  it("skips already-emailed candidates", async () => {
    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "passed",
      score: 20,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 20,
        threshold: 15,
      },
    };
    resultStore.insert(result);

    await sender.sendPending("运维工程师");
    const sent2 = await sender.sendPending("运维工程师");
    expect(sent2).toBe(0);
    expect(transport.sentMails.length).toBe(1);
  });

  it("does not send for rejected candidates", async () => {
    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "rejected",
      score: 5,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 5,
        threshold: 15,
      },
    };
    resultStore.insert(result);

    const sent = await sender.sendPending("运维工程师");
    expect(sent).toBe(0);
    expect(transport.sentMails.length).toBe(0);
  });

  it("handles transport failure gracefully", async () => {
    const failTransport: EmailTransport = {
      sendMail: async () => {
        throw new Error("SMTP connection failed");
      },
    };
    const failSender = new EmailSender(
      failTransport,
      emailLog,
      resultStore,
      candidateStore,
      EMAIL_CONFIG,
    );

    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "passed",
      score: 20,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 20,
        threshold: 15,
      },
    };
    resultStore.insert(result);

    // Should not throw
    const sent = await failSender.sendPending("运维工程师");
    expect(sent).toBe(0);
    // Should not have logged to email_log
    expect(emailLog.hasSent("c1", "运维工程师")).toBe(false);
  });
});
