import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewCandidateStore } from "../../src/store/interview-candidates.js";
import { InterviewScheduleStore } from "../../src/store/interview-schedule.js";
import { SlotManager } from "../../src/interview/slot-manager.js";
import type { InterviewConfig } from "../../src/types/index.js";

function makeConfig(overrides?: Partial<InterviewConfig>): InterviewConfig {
  return {
    availableSlots: [
      "2026-06-16 10:00-12:00",
      "2026-06-17 14:00-16:00",
    ],
    durationMinutes: 60,
    bufferMinutes: 15,
    replyTimeoutDays: 3,
    maxOptionsPerRound: 3,
    messageTemplate: "您好 {name}，可选时间：\n{slots}",
    meetingSubject: "面试",
    ...overrides,
  };
}

describe("SlotManager", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
    const candidates = new CandidateStore(db);
    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://example.com/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  afterEach(() => { db.close(); });

  it("generates slots from configured time ranges", () => {
    const config = makeConfig();
    const manager = new SlotManager(db, config);
    const slots = manager.getAvailableSlots();

    expect(slots.length).toBeGreaterThan(0);
    // "2026-06-16 10:00-12:00" → 10:00-11:00, 11:15-12:15? Actually 11:00-12:00 with buffer
    // duration=60, buffer=15 → slot1: 10:00-11:00, then cursor = 11:00+15 = 11:15 → can't fit another 60min
    // "2026-06-17 14:00-16:00" → 14:00-15:00, then 15:15-16:15 no fit
    expect(slots.length).toBeGreaterThanOrEqual(1);
    expect(slots[0].available).toBe(true);
    expect(slots[0].label).toContain("6月16日");
  });

  it("respects maxOptionsPerRound", () => {
    const config = makeConfig({
      availableSlots: ["2026-06-16 08:00-18:00"],
      maxOptionsPerRound: 3,
      durationMinutes: 60,
      bufferMinutes: 0,
    });
    const manager = new SlotManager(db, config);
    const slots = manager.getAvailableSlots();
    expect(slots.length).toBeLessThanOrEqual(3);
  });

  it("excludes booked slots", () => {
    const config = makeConfig({
      availableSlots: ["2026-06-16 10:00-12:00"],
      durationMinutes: 60,
      bufferMinutes: 0,
    });
    const manager = new SlotManager(db, config);

    // Book the first available slot
    const scheduleStore = new InterviewScheduleStore(db);
    scheduleStore.insert({
      candidateId: "c1",
      positionName: "中级运维工程师",
      interviewTime: "2026-06-16T10:00:00",
      status: "confirmed",
    });

    const slots = manager.getAvailableSlots();
    // Should exclude the 10:00-11:00 slot
    const firstSlotBooked = slots.every((s) => s.startTime !== "2026-06-16T10:00:00");
    expect(firstSlotBooked).toBe(true);
  });

  it("detects time conflicts", () => {
    const config = makeConfig();
    const manager = new SlotManager(db, config);

    const scheduleStore = new InterviewScheduleStore(db);
    scheduleStore.insert({
      candidateId: "c1",
      positionName: "中级运维工程师",
      interviewTime: "2026-06-16T10:00:00",
      status: "confirmed",
    });

    expect(manager.hasConflict("2026-06-16T10:00:00", "2026-06-16T11:00:00")).toBe(true);
    expect(manager.hasConflict("2026-06-16T09:30:00", "2026-06-16T10:15:00")).toBe(true);
    expect(manager.hasConflict("2026-06-16T11:00:00", "2026-06-16T12:00:00")).toBe(false);
  });

  it("handles buffer between slots", () => {
    const config = makeConfig({
      availableSlots: ["2026-06-16 10:00-12:00"],
      durationMinutes: 60,
      bufferMinutes: 30,
    });
    const manager = new SlotManager(db, config);
    const slots = manager.getAvailableSlots();

    // 10:00-12:00 with duration=60 and buffer=30
    // → one slot only: 10:00-11:00 (then cursor = 11:00+30 = 11:30 → only 30min left, can't fit 60min)
    expect(slots.length).toBe(1);
    expect(slots[0].startTime).toContain("10:00");
  });
});
