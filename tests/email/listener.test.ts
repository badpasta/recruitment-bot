import { describe, it, expect } from "vitest";
import { parseReplyAction } from "../../src/email/listener.js";

describe("parseReplyAction", () => {
  it('returns "interview" when text contains "约面试"', () => {
    expect(parseReplyAction("好的，约面试吧")).toBe("interview");
  });

  it('returns "eliminated" when text contains "淘汰"', () => {
    expect(parseReplyAction("这个候选人淘汰")).toBe("eliminated");
  });

  it('returns "unknown" for unrecognized text', () => {
    expect(parseReplyAction("收到，谢谢")).toBe("unknown");
  });

  it('returns "unknown" for empty text', () => {
    expect(parseReplyAction("")).toBe("unknown");
  });

  it("matches keywords embedded in longer text", () => {
    expect(parseReplyAction("我看了一下简历，可以约面试看看")).toBe("interview");
  });

  it("handles mixed case (Chinese keywords are case-insensitive)", () => {
    // Chinese characters don't have case, but verify it still works
    expect(parseReplyAction("淘汰这个候选人")).toBe("eliminated");
  });

  it('prioritizes first keyword match ("约面试" before "淘汰")', () => {
    // "约面试" comes first in the KEYWORDS object
    expect(parseReplyAction("先约面试，不行再淘汰")).toBe("interview");
  });
});
