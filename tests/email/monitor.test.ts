import { describe, it, expect, beforeEach } from "vitest";
import { ReplyMonitor } from "../../src/email/monitor.js";
import type { ImapClient, ImapMessage } from "../../src/email/types.js";
import { initDatabase } from "../../src/store/db.js";
import { EmailLogStore } from "../../src/store/email-log.js";
import { ResultStore } from "../../src/store/results.js";
import type { EmailConfig } from "../../src/types/index.js";

class MockImapClient implements ImapClient {
  public messages: ImapMessage[] = [];
  public markedSeen: number[] = [];
  public connected = false;

  async connect() {
    this.connected = true;
  }
  async fetchUnseen() {
    return this.messages;
  }
  async markSeen(uid: number) {
    this.markedSeen.push(uid);
  }
  async disconnect() {
    this.connected = false;
  }
}

const EMAIL_CONFIG: EmailConfig = {
  smtpHost: "",
  smtpPort: 465,
  smtpUser: "",
  fromName: "",
  to: "",
  imapHost: "imap.test.com",
  imapPort: 993,
  imapUser: "test@test.com",
  replyKeywords: { interview: ["约面试"], eliminated: ["淘汰"] },
};

describe("ReplyMonitor", () => {
  let db: ReturnType<typeof initDatabase>;
  let monitor: ReplyMonitor;
  let imapClient: MockImapClient;
  let emailLog: EmailLogStore;
  let resultStore: ResultStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    imapClient = new MockImapClient();
    emailLog = new EmailLogStore(db);
    resultStore = new ResultStore(db);
    monitor = new ReplyMonitor(
      imapClient,
      emailLog,
      resultStore,
      EMAIL_CONFIG,
    );

    // Seed: a candidate, a passed screening result, and a sent email that can be replied to
    db.exec(
      `INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', '张三', '', '{}')`,
    );
    resultStore.insert({
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
    });
    emailLog.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<sent-001@test>",
      statusUpdated: false,
    });
  });

  it("processes reply with interview keyword and updates status", async () => {
    imapClient.messages = [
      {
        uid: 1,
        messageId: "<reply-001@test>",
        inReplyTo: "<sent-001@test>",
        subject: "Re: 招聘筛选",
        text: "好的，约面试吧",
      },
    ];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(1);

    // Check status was updated
    const results = resultStore.getByStatus("interview");
    expect(results.length).toBe(1);
    expect(results[0].candidateId).toBe("c1");

    // Check email was marked seen
    expect(imapClient.markedSeen).toContain(1);

    // Check email_log has received entry
    expect(emailLog.hasReceivedMessage("<reply-001@test>")).toBe(true);
  });

  it("processes reply with eliminated keyword", async () => {
    imapClient.messages = [
      {
        uid: 1,
        messageId: "<reply-002@test>",
        inReplyTo: "<sent-001@test>",
        subject: "Re: 招聘筛选",
        text: "不合适，淘汰",
      },
    ];

    await monitor.checkReplies();
    const results = resultStore.getByStatus("eliminated");
    expect(results.length).toBe(1);
  });

  it("skips messages with no matching keyword", async () => {
    imapClient.messages = [
      {
        uid: 1,
        messageId: "<reply-003@test>",
        inReplyTo: "<sent-001@test>",
        subject: "Re: 招聘筛选",
        text: "收到，谢谢",
      },
    ];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(1); // Still processed, just no keyword match

    // Status should NOT be updated
    const results = resultStore.getByStatus("interview");
    expect(results.length).toBe(0);
  });

  it("skips already-processed messages (by message_id)", async () => {
    // Pre-insert the received message
    emailLog.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "received",
      messageId: "<reply-001@test>",
      statusUpdated: false,
    });

    imapClient.messages = [
      {
        uid: 1,
        messageId: "<reply-001@test>",
        inReplyTo: "<sent-001@test>",
        subject: "Re: 招聘筛选",
        text: "约面试",
      },
    ];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(0);
  });

  it("skips replies that cannot be matched to a sent email", async () => {
    imapClient.messages = [
      {
        uid: 1,
        messageId: "<reply-unknown@test>",
        inReplyTo: "<nonexistent-sent@test>",
        subject: "Re: something else",
        text: "约面试",
      },
    ];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(0);
  });

  it("handles IMAP connection failure gracefully", async () => {
    const failClient: ImapClient = {
      connect: async () => {
        throw new Error("IMAP connection refused");
      },
      fetchUnseen: async () => [],
      markSeen: async () => {},
      disconnect: async () => {},
    };
    const failMonitor = new ReplyMonitor(
      failClient,
      emailLog,
      resultStore,
      EMAIL_CONFIG,
    );

    // Should not throw
    const processed = await failMonitor.checkReplies();
    expect(processed).toBe(0);
  });
});
