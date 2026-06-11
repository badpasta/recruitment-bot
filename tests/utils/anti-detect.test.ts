import { describe, it, expect, vi } from "vitest";
import {
  randomDelay,
  extractCandidateId,
} from "../../src/utils/anti-detect.js";

describe("randomDelay", () => {
  it("resolves after a delay within the given range", async () => {
    vi.useFakeTimers();
    const promise = randomDelay(100, 200);
    vi.advanceTimersByTime(200);
    await promise;
    vi.useRealTimers();
  });
});

describe("extractCandidateId", () => {
  it("extracts ID from Boss直聘 profile URL with geek_card param", () => {
    const url = "https://www.zhipin.com/web/geek/card?geek_card=abc123def&lid=xyz";
    expect(extractCandidateId(url)).toBe("abc123def");
  });

  it("extracts ID from URL path segment", () => {
    const url = "https://www.zhipin.com/gongsi/job/abc12345.html";
    expect(extractCandidateId(url)).toBe("abc12345");
  });

  it("falls back to hashing the full URL when no ID pattern found", () => {
    const url = "https://www.zhipin.com/some/random/page";
    const id = extractCandidateId(url);
    expect(id).toBeTruthy();
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns same ID for same URL (deterministic fallback)", () => {
    const url = "https://www.zhipin.com/some/random/page";
    expect(extractCandidateId(url)).toBe(extractCandidateId(url));
  });
});
