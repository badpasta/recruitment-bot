import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { ResultStore } from "../../src/store/results.js";
import { EmailStore } from "../../src/store/email-store.js";

describe("EmailStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let results: ResultStore;
  let emailStore: EmailStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    results = new ResultStore(db);
    emailStore = new EmailStore(db);
    candidates.upsert({
      id: "c1",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("recordSentEmail / getSentByMessageId", () => {
    it("records and retrieves a sent email", () => {
      const resultId = results.insert({
        candidateId: "c1", positionName: "中级运维工程师", status: "passed", score: 25,
        matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 25, threshold: 15 },
      });

      emailStore.recordSentEmail({
        messageId: "<msg-001@test>",
        candidateId: "c1",
        positionName: "中级运维工程师",
        resultId,
      });

      const found = emailStore.getSentByMessageId("<msg-001@test>");
      expect(found).not.toBeNull();
      expect(found!.candidateId).toBe("c1");
      expect(found!.positionName).toBe("中级运维工程师");
      expect(found!.resultId).toBe(resultId);
    });

    it("returns null for non-existent message ID", () => {
      expect(emailStore.getSentByMessageId("<not-found>")).toBeNull();
    });

    it("ignores duplicate inserts", () => {
      emailStore.recordSentEmail({
        messageId: "<dup@test>",
        candidateId: "c1",
        positionName: "Pos",
      });
      emailStore.recordSentEmail({
        messageId: "<dup@test>",
        candidateId: "c1",
        positionName: "Pos",
      });
      // Should not throw, and only one record should exist
      expect(emailStore.getSentByMessageId("<dup@test>")).not.toBeNull();
    });
  });

  describe("isReplyProcessed / recordProcessedReply", () => {
    it("returns false for unprocessed reply", () => {
      expect(emailStore.isReplyProcessed("<reply-001>")).toBe(false);
    });

    it("returns true after recording a processed reply", () => {
      emailStore.recordProcessedReply({
        messageId: "<reply-001>",
        inReplyTo: "<msg-001@test>",
        candidateId: "c1",
        action: "interview",
      });
      expect(emailStore.isReplyProcessed("<reply-001>")).toBe(true);
    });

    it("ignores duplicate reply inserts", () => {
      emailStore.recordProcessedReply({
        messageId: "<reply-dup>",
        action: "eliminated",
      });
      emailStore.recordProcessedReply({
        messageId: "<reply-dup>",
        action: "eliminated",
      });
      expect(emailStore.isReplyProcessed("<reply-dup>")).toBe(true);
    });
  });

  describe("getSentByEmail", () => {
    it("returns all sent emails for a candidate and position", () => {
      emailStore.recordSentEmail({
        messageId: "<a@test>",
        candidateId: "c1",
        positionName: "Pos1",
      });
      emailStore.recordSentEmail({
        messageId: "<b@test>",
        candidateId: "c1",
        positionName: "Pos1",
      });
      emailStore.recordSentEmail({
        messageId: "<c@test>",
        candidateId: "c1",
        positionName: "Pos2",
      });

      const pos1Emails = emailStore.getSentByEmail("c1", "Pos1");
      expect(pos1Emails).toHaveLength(2);

      const pos2Emails = emailStore.getSentByEmail("c1", "Pos2");
      expect(pos2Emails).toHaveLength(1);
    });
  });
});
