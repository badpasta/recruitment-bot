import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewMessageStore } from "../../src/store/interview-messages.js";

describe("InterviewMessageStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let store: InterviewMessageStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    store = new InterviewMessageStore(db);
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  afterEach(() => { db.close(); });

  it("inserts a message", () => {
    const id = store.insert({
      candidateId: "c1", positionName: "Test", direction: "sent",
      content: "您好，我们想邀请您参加面试",
    });
    expect(typeof id).toBe("number");
  });

  it("gets messages by candidate and position", () => {
    store.insert({ candidateId: "c1", positionName: "Test", direction: "sent", content: "Hello" });
    store.insert({ candidateId: "c1", positionName: "Test", direction: "received", content: "Hi" });
    const msgs = store.getByCandidateAndPosition("c1", "Test");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe("Hi"); // most recent first
  });

  it("returns empty array for no messages", () => {
    expect(store.getByCandidateAndPosition("no", "no")).toEqual([]);
  });

  it("gets recent messages limited by count", () => {
    store.insert({ candidateId: "c1", positionName: "Test", direction: "sent", content: "1" });
    store.insert({ candidateId: "c1", positionName: "Test", direction: "received", content: "2" });
    store.insert({ candidateId: "c1", positionName: "Test", direction: "sent", content: "3" });
    store.insert({ candidateId: "c1", positionName: "Test", direction: "received", content: "4" });
    const recent = store.getRecent("c1", "Test", 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].content).toBe("4");
    expect(recent[1].content).toBe("3");
  });

  it("distinguishes sent vs received direction", () => {
    store.insert({ candidateId: "c1", positionName: "Test", direction: "sent", content: "S" });
    store.insert({ candidateId: "c1", positionName: "Test", direction: "received", content: "R" });
    const byDir = (dir: string) =>
      store.getByCandidateAndPosition("c1", "Test").filter((m) => m.direction === dir);
    expect(byDir("sent")).toHaveLength(1);
    expect(byDir("received")).toHaveLength(1);
  });
});
