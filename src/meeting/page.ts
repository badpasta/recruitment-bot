import type { MeetingResult } from "./types.js";

/**
 * DOM selectors for the Tencent Meeting web console.
 * Used by browser automation to locate and interact with page elements.
 */
export const SELECTORS = Object.freeze({
  /** Login page indicators — if any of these match, the user is NOT logged in */
  loginIndicators: [
    ".login-container",
    ".login-qrcode",
    ".login-btn",
    ".sso-login-btn",
    ".wechat-login-btn",
  ] as readonly string[],

  /** Booking form: meeting subject/topic input */
  subjectInput: ".meeting-subject, input[placeholder*='主题'], input[placeholder*='subject']",

  /** Booking form: start time input */
  startTimeInput: ".meeting-start-time, .start-time input, input[placeholder*='开始']",

  /** Booking form: end time input */
  endTimeInput: ".meeting-end-time, .end-time input, input[placeholder*='结束']",

  /** Booking form: meeting password input */
  passwordInput: ".meeting-password, input[placeholder*='密码'], input[placeholder*='password']",

  /** Booking form: submit / schedule button */
  submitButton: ".submit-btn, button[type='submit'], button:has-text('预定')",

  /** Result page: meeting ID element */
  meetingIdResult: ".meeting-id, .id-display, .td-meeting-id",

  /** Result page: meeting code element */
  meetingCodeResult: ".meeting-code, .code-display, .td-meeting-code",

  /** Result page: join URL link */
  joinUrlResult: ".join-url, .link-display, .td-join-url, a[href*='meeting.tencent.com/dm/']",

  /** Error message container */
  errorContainer: ".error-toast, .error-dialog, .error-message, .error-desc, .alert-danger, .error-page",
});

/**
 * Returns the frozen SELECTORS constant.
 */
export function getSelectors(): typeof SELECTORS {
  return SELECTORS;
}

// ── Regex helpers ──

function hasMatch(html: string, pattern: RegExp): boolean {
  return pattern.test(html);
}

function extractText(html: string, className: string): string | null {
  // Try to match class="className">content< (with optional whitespace and other classes)
  const patterns = [
    new RegExp(`class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>([^<]+)<`, "i"),
    new RegExp(`class='[^']*\\b${escapeRegex(className)}\\b[^']*'[^>]*>([^<]+)<`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]?.trim()) return m[1].trim();
  }
  return null;
}

function extractHref(html: string, className: string): string | null {
  const patterns = [
    new RegExp(
      `<a[^>]*class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*href="([^"]*)"`,
      "i",
    ),
    new RegExp(
      `<a[^>]*class='[^']*\\b${escapeRegex(className)}\\b[^']*'[^>]*href='([^']*)'`,
      "i",
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]?.trim()) return m[1].trim();
  }
  return null;
}

function hasElementWithClass(html: string, className: string): boolean {
  return new RegExp(`class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"`, "i").test(html);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── detectLoginState ──

/**
 * Detects whether the page HTML represents a logged-in state.
 * Returns `false` if login indicators (QR code, login button, SSO button) are found.
 * Returns `true` if the user appears to be authenticated (avatar, booking form, meeting list).
 */
export function detectLoginState(html: string): boolean {
  if (!html) return false;

  // Check for login page indicators
  for (const selector of SELECTORS.loginIndicators) {
    const className = selector.replace(/^\./, "");
    if (hasElementWithClass(html, className)) {
      return false;
    }
  }

  // Check for logged-in indicators
  const loggedInPatterns = [
    /class="[^"]*\buser-avatar\b[^"]*"/i,
    /class="[^"]*\buser-name\b[^"]*"/i,
    /class="[^"]*\bmeeting-form\b[^"]*"/i,
    /class="[^"]*\bmeeting-room-list\b[^"]*"/i,
    /class="[^"]*\bmeeting-result\b[^"]*"/i,
    /class="[^"]*\bsuccess-panel\b[^"]*"/i,
    /class="[^"]*\bresult-modal\b[^"]*"/i,
  ];

  return loggedInPatterns.some((p) => p.test(html));
}

// ── parseResult ──

/**
 * Parses meeting booking result from the HTML of a success page or modal.
 * Returns `MeetingResult` with meeting ID, meeting code, and join URL,
 * or `null` if no result is found.
 */
export function parseResult(html: string): MeetingResult | null {
  if (!html) return null;

  // Extract meeting ID — try multiple class names and table patterns
  const meetingId =
    extractText(html, "meeting-id") ??
    extractText(html, "id-display") ??
    extractText(html, "td-meeting-id");

  // Extract meeting code
  const meetingCode =
    extractText(html, "meeting-code") ??
    extractText(html, "code-display") ??
    extractText(html, "td-meeting-code");

  // Extract join URL — try class-based text, href extraction, and direct link match
  const joinUrl =
    extractText(html, "join-url") ??
    extractText(html, "link-display") ??
    extractText(html, "td-join-url") ??
    extractHref(html, "join-url") ??
    extractHref(html, "link-display") ??
    extractHref(html, "td-join-url");

  // Also try to find any meeting.tencent.com/dm/ link
  const fallbackUrl = joinUrl ?? html.match(/https:\/\/meeting\.tencent\.com\/dm\/[^\s"'<>]+/)?.[0] ?? null;

  if (meetingId && meetingCode && fallbackUrl) {
    return {
      meetingId,
      meetingCode,
      joinUrl: fallbackUrl,
    };
  }

  return null;
}

// ── detectError ──

/**
 * Detects error messages in the page HTML.
 * Returns the error message string if found, or `null` if no error is present.
 *
 * Recognized error categories:
 * - Time conflict ("时间冲突", "已被占用")
 * - Network timeout ("网络超时", "网络错误", "timeout")
 * - Permission denied ("权限不足", "没有权限", "403")
 * - Generic errors (alert, toast, dialog error elements)
 */
export function detectError(html: string): string | null {
  if (!html) return null;

  const errorText = extractErrorText(html);
  if (!errorText) return null;

  // Categorize and return the most specific message
  if (/时间冲突|已被占用|时间段.*冲突|时间.*占用/.test(errorText)) {
    const match = errorText.match(/[^。.!！\n]*时间[^。.!！\n]*/);
    return match ? match[0].trim() : "时间冲突";
  }

  if (/网络超时|网络错误|网络.*超时|timeout|网络.*重试/.test(errorText)) {
    const match = errorText.match(/[^。.!！\n]*网络[^。.!！\n]*/);
    return match ? match[0].trim() : "网络错误";
  }

  if (/权限不足|没有权限|无权|403|权限/.test(errorText)) {
    const match = errorText.match(/[^。.!！\n]*权限[^。.!！\n]*/);
    return match ? match[0].trim() : "权限不足";
  }

  // Generic error — return the raw text, trimmed
  return errorText.trim() || null;
}

function extractErrorText(html: string): string | null {
  // Extract from known error elements
  // Try specific message-level elements first, then container-level fallbacks
  const errorElementPatterns = [
    /class="[^"]*\berror-message\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    /class="[^"]*\berror-desc\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    /class="[^"]*\berror-text\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    /class="[^"]*\berror-toast\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /class="[^"]*\berror-dialog\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /class="[^"]*\balert-danger\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /class="[^"]*\berror-page\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of errorElementPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const text = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }

  return null;
}
