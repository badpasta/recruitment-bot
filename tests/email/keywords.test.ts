import { describe, it, expect } from "vitest";
import { detectKeyword } from "../../src/email/keywords.js";

const DEFAULT_KEYWORDS: Record<string, string[]> = {
  interview: ["约面试", "安排面试", "可以面试"],
  eliminated: ["淘汰", "不合适", "不考虑"],
};

describe("detectKeyword", () => {
  it("detects 约面试 keyword", () => {
    expect(detectKeyword("好的，约面试吧", DEFAULT_KEYWORDS)).toBe("interview");
  });

  it("detects 淘汰 keyword", () => {
    expect(detectKeyword("这个人不合适，淘汰", DEFAULT_KEYWORDS)).toBe("eliminated");
  });

  it("returns 'none' when no keyword matches", () => {
    expect(detectKeyword("收到，谢谢", DEFAULT_KEYWORDS)).toBe("none");
  });

  it("interview has priority over eliminated", () => {
    expect(detectKeyword("先约面试，不合适的再淘汰", DEFAULT_KEYWORDS)).toBe("interview");
  });

  it("is case insensitive for ASCII keywords", () => {
    const keywords = { interview: ["interview"], eliminated: ["reject"] };
    expect(detectKeyword("Let's INTERVIEW this candidate", keywords)).toBe("interview");
  });

  it("matches 安排面试", () => {
    expect(detectKeyword("请安排面试", DEFAULT_KEYWORDS)).toBe("interview");
  });

  it("matches 不考虑", () => {
    expect(detectKeyword("这个人不考虑了", DEFAULT_KEYWORDS)).toBe("eliminated");
  });

  it("handles empty body", () => {
    expect(detectKeyword("", DEFAULT_KEYWORDS)).toBe("none");
  });

  it("handles empty keywords config", () => {
    expect(detectKeyword("约面试", {})).toBe("none");
  });
});
