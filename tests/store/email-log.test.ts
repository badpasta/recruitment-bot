import { describe, it, expect, beforeEach } from "vitest";
import { initDatabase } from "../../src/store/db.js";
import { EmailLogStore } from "../../src/store/email-log.js";
import type Database from "better-sqlite3";

describe("EmailLogStore", () => {
  let db: Database.Database;
  let store: EmailLogStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new EmailLogStore(db);
    // Seed a candidate
    db.exec(
      `INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', '张三', '', '{}')`,
    );
  });

  it("inserts a sent entry", () => {
    const id = store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<msg-001@test>",
      subject: "Test subject",
      body: "<p>Test body</p>",
      statusUpdated: false,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("hasSent returns true after inserting sent entry", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<msg-001@test>",
      statusUpdated: false,
    });
    expect(store.hasSent("c1", "运维工程师")).toBe(true);
  });

  it("hasSent returns false for unsent candidate", () => {
    expect(store.hasSent("c1", "运维工程师")).toBe(false);
  });

  it("findByMessageId returns entry when found", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<msg-001@test>",
      statusUpdated: false,
    });
    const entry = store.findByMessageId("<msg-001@test>");
    expect(entry).not.toBeNull();
    expect(entry!.candidateId).toBe("c1");
  });

  it("findByMessageId returns null when not found", () => {
    expect(store.findByMessageId("<nonexistent>")).toBeNull();
  });

  it("inserts received entry with keyword", () => {
    const id = store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "received",
      messageId: "<reply-001@test>",
      inReplyTo: "<msg-001@test>",
      keywordDetected: "interview",
      statusUpdated: true,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("hasReceivedMessage returns true for existing message_id", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "received",
      messageId: "<reply-001@test>",
      statusUpdated: false,
    });
    expect(store.hasReceivedMessage("<reply-001@test>")).toBe(true);
  });
});
