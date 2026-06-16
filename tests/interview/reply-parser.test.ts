import { describe, it, expect } from "vitest";
import { parseCandidateReply } from "../../src/interview/reply-parser.js";
import type { InterviewSlot } from "../../src/types/index.js";

function makeSlots(n: number): InterviewSlot[] {
  return Array.from({ length: n }, (_, i) => ({
    startTime: `2026-06-${16 + i}T10:00:00+08:00`,
    endTime: `2026-06-${16 + i}T11:00:00+08:00`,
    label: `6月${16 + i}日 10:00-11:00`,
    available: true,
  }));
}

describe("parseCandidateReply", () => {
  const slots = makeSlots(3);

  it("parses simple number selection '1'", () => {
    const result = parseCandidateReply("1", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(0);
  });

  it("parses number selection '2'", () => {
    const result = parseCandidateReply("2", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(1);
  });

  it("parses number with '选' prefix", () => {
    const result = parseCandidateReply("选1", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(0);
  });

  it("parses '选第2个'", () => {
    const result = parseCandidateReply("选第2个", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(1);
  });

  it("parses '第一个'", () => {
    const result = parseCandidateReply("第一个", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(0);
  });

  it("parses '第二个'", () => {
    const result = parseCandidateReply("第二个", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(1);
  });

  it("parses '第三个'", () => {
    const result = parseCandidateReply("第三个", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(2);
  });

  it("parses '第1个'", () => {
    const result = parseCandidateReply("第1个", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(0);
  });

  it("parses '3' as valid slot index", () => {
    const result = parseCandidateReply("3", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(2);
  });

  it("returns unknown for out-of-range number '0'", () => {
    const result = parseCandidateReply("0", slots);
    expect(result.type).toBe("unknown");
  });

  it("returns unknown for out-of-range number '5'", () => {
    const result = parseCandidateReply("5", slots);
    expect(result.type).toBe("unknown");
  });

  it("detects decline: '不去'", () => {
    const result = parseCandidateReply("不去", slots);
    expect(result.type).toBe("declined");
  });

  it("detects decline: '不考虑'", () => {
    const result = parseCandidateReply("不考虑", slots);
    expect(result.type).toBe("declined");
  });

  it("detects decline: '拒绝'", () => {
    const result = parseCandidateReply("拒绝", slots);
    expect(result.type).toBe("declined");
  });

  it("detects decline: '不去了'", () => {
    const result = parseCandidateReply("不去了", slots);
    expect(result.type).toBe("declined");
  });

  it("detects decline: '算了'", () => {
    const result = parseCandidateReply("算了", slots);
    expect(result.type).toBe("declined");
  });

  it("detects custom time patterns", () => {
    const result = parseCandidateReply("6月18号下午可以吗", slots);
    expect(result.type).toBe("custom_time");
  });

  it("detects custom time with '周' pattern", () => {
    const result = parseCandidateReply("周三上午可以", slots);
    expect(result.type).toBe("custom_time");
  });

  it("returns unknown for ambiguous text", () => {
    const result = parseCandidateReply("你好", slots);
    expect(result.type).toBe("unknown");
  });

  it("returns unknown for empty string", () => {
    const result = parseCandidateReply("", slots);
    expect(result.type).toBe("unknown");
  });

  it("handles extra whitespace around number", () => {
    const result = parseCandidateReply("  2  ", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(1);
  });

  it("parses '就第一个吧'", () => {
    const result = parseCandidateReply("就第一个吧", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(0);
  });

  it("parses loose number extraction from mixed text", () => {
    const result = parseCandidateReply("我觉得第2个时间可以", slots);
    expect(result.type).toBe("slot_selected");
    expect(result.selectedSlotIndex).toBe(1);
  });
});
