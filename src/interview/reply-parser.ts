import type { InterviewSlot, ParsedReply } from "../types/index.js";

const DECLINE_KEYWORDS = ["不去", "不考虑", "拒绝", "不去了", "算了", "不用了", "暂时不考虑"];
const CUSTOM_TIME_KEYWORDS = ["号", "周", "月", "日", "点", "下午", "上午", "晚上"];

const CHINESE_NUMBERS: Record<string, number> = {
  "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
};

/**
 * Parse a candidate's chat reply to determine what they chose.
 *
 * Detection order:
 * 1. Decline keywords ("不去", "不考虑", etc.)
 * 2. Chinese ordinal ("第一个", "第二个", "第三个")
 * 3. Numeric selection with prefix ("选1", "选第2个", "第1个")
 * 4. Bare number ("1", "2", "3")
 * 5. Custom time keywords ("号", "周", etc.)
 * 6. Unknown
 */
export function parseCandidateReply(text: string, offeredSlots: InterviewSlot[]): ParsedReply {
  const trimmed = text.trim();

  if (!trimmed) {
    return { type: "unknown", rawText: text };
  }

  // 1. Decline detection
  const lower = trimmed.toLowerCase();
  for (const kw of DECLINE_KEYWORDS) {
    if (lower.includes(kw)) {
      return { type: "declined", rawText: text };
    }
  }

  // 2. Chinese ordinal: "第一个", "第二个", "第三个"
  for (const [cn, num] of Object.entries(CHINESE_NUMBERS)) {
    if (trimmed.includes(`第${cn}个`)) {
      const idx = num - 1;
      if (idx >= 0 && idx < offeredSlots.length) {
        return { type: "slot_selected", selectedSlotIndex: idx, rawText: text };
      }
    }
  }

  // 3. "选第N个", "第N个"
  const diNgeMatch = trimmed.match(/第\s*(\d+)\s*个/);
  if (diNgeMatch) {
    const idx = parseInt(diNgeMatch[1], 10) - 1;
    if (idx >= 0 && idx < offeredSlots.length) {
      return { type: "slot_selected", selectedSlotIndex: idx, rawText: text };
    }
  }

  // 4. "选N" or bare number at word boundary
  const xuanMatch = trimmed.match(/选\s*(\d+)/);
  if (xuanMatch) {
    const idx = parseInt(xuanMatch[1], 10) - 1;
    if (idx >= 0 && idx < offeredSlots.length) {
      return { type: "slot_selected", selectedSlotIndex: idx, rawText: text };
    }
  }

  // 5. Bare digit-only (possibly the entire message)
  const bareDigitMatch = trimmed.match(/^(\d+)$/);
  if (bareDigitMatch) {
    const idx = parseInt(bareDigitMatch[1], 10) - 1;
    if (idx >= 0 && idx < offeredSlots.length) {
      return { type: "slot_selected", selectedSlotIndex: idx, rawText: text };
    }
    // Out of range number
    return { type: "unknown", rawText: text };
  }

  // 6. Fuzzier: look for "第N" or "N" embedded in text ("就第1个吧", "我觉得第2个时间可以")
  const fuzzyMatch = trimmed.match(/第\s*(\d+)\s*[个|时间]/);
  if (fuzzyMatch) {
    const idx = parseInt(fuzzyMatch[1], 10) - 1;
    if (idx >= 0 && idx < offeredSlots.length) {
      return { type: "slot_selected", selectedSlotIndex: idx, rawText: text };
    }
  }

  // 7. Custom time keywords
  for (const kw of CUSTOM_TIME_KEYWORDS) {
    if (trimmed.includes(kw)) {
      return { type: "custom_time", customTime: trimmed, rawText: text };
    }
  }

  return { type: "unknown", rawText: text };
}
