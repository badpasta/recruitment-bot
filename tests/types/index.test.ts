import { describe, it, expect } from "vitest";
import {
  isValidScreeningStatus,
  isValidScheduleStatus,
  isCandidate,
  type Candidate,
} from "../../src/types/index.js";

describe("isValidScreeningStatus", () => {
  it("accepts valid statuses", () => {
    expect(isValidScreeningStatus("passed")).toBe(true);
    expect(isValidScreeningStatus("rejected")).toBe(true);
    expect(isValidScreeningStatus("pending")).toBe(true);
    expect(isValidScreeningStatus("eliminated")).toBe(true);
    expect(isValidScreeningStatus("interview")).toBe(true);
  });

  it("rejects invalid statuses", () => {
    expect(isValidScreeningStatus("unknown")).toBe(false);
    expect(isValidScreeningStatus("")).toBe(false);
  });
});

describe("isValidScheduleStatus", () => {
  it("accepts valid schedule statuses", () => {
    expect(isValidScheduleStatus("waiting_time")).toBe(true);
    expect(isValidScheduleStatus("time_proposed")).toBe(true);
    expect(isValidScheduleStatus("confirmed")).toBe(true);
    expect(isValidScheduleStatus("scheduled")).toBe(true);
    expect(isValidScheduleStatus("cancelled")).toBe(true);
  });

  it("rejects invalid schedule statuses", () => {
    expect(isValidScheduleStatus("unknown")).toBe(false);
    expect(isValidScheduleStatus("")).toBe(false);
    expect(isValidScheduleStatus("passed")).toBe(false);
  });
});

describe("isCandidate", () => {
  it("validates a complete candidate object", () => {
    const c: Candidate = {
      id: "abc123",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s"], status: "离职-随时到岗", workHistory: [], projectHistory: [] },
    };
    expect(isCandidate(c)).toBe(true);
  });

  it("rejects object missing required id", () => {
    expect(isCandidate({ name: "张三" })).toBe(false);
  });

  it("rejects null", () => {
    expect(isCandidate(null)).toBe(false);
  });
});
