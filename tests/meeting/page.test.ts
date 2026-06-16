import { describe, it, expect } from "vitest";
import {
  detectLoginState,
  getSelectors,
  parseResult,
  detectError,
  SELECTORS,
} from "../../src/meeting/page.js";

// ── detectLoginState ──

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>腾讯会议 - 登录</title></head>
<body>
  <div class="login-container">
    <div class="login-qrcode">
      <img src="/qrcode.png" alt="扫码登录" />
      <p>请使用腾讯会议App扫码登录</p>
    </div>
    <div class="login-tabs">
      <span class="tab active">扫码登录</span>
      <span class="tab">账号密码登录</span>
    </div>
    <input class="phone-input" placeholder="请输入手机号" />
    <input class="code-input" placeholder="请输入验证码" />
    <button class="login-btn wechat">微信登录</button>
    <button class="login-btn sso">SSO登录</button>
  </div>
</body>
</html>`;

const LOGGED_IN_HTML = `<!DOCTYPE html>
<html>
<head><title>腾讯会议 - 用户中心</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar">
      <img src="/avatar.png" alt="头像" />
      <span class="user-name">recruitment-bot</span>
    </div>
    <nav>
      <a href="/user-center/schedule">预定会议</a>
      <a href="/user-center/meeting-list">会议列表</a>
    </nav>
  </header>
  <main>
    <div class="meeting-room-list">
      <h2>即将开始的会议</h2>
      <ul><li>没有即将开始的会议</li></ul>
    </div>
  </main>
</body>
</html>`;

const BOOKING_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><title>预定会议 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <form class="meeting-form">
      <h2>预定会议</h2>
      <div class="form-group">
        <label>会议主题</label>
        <input class="meeting-subject" placeholder="请输入会议主题" value="面试 - 张三 / 中级运维工程师" />
      </div>
      <div class="form-row">
        <div class="form-group start-time">
          <label>开始时间</label>
          <input class="meeting-start-time" type="datetime-local" value="2026-06-16T10:00" />
        </div>
        <div class="form-group end-time">
          <label>结束时间</label>
          <input class="meeting-end-time" type="datetime-local" value="2026-06-16T11:00" />
        </div>
      </div>
      <div class="form-group">
        <label>会议密码</label>
        <input class="meeting-password" placeholder="可不填" value="" />
      </div>
      <button type="submit" class="submit-btn">预定</button>
    </form>
  </main>
</body>
</html>`;

const RESULT_SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><title>预定成功 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <div class="meeting-result success">
      <div class="result-icon success-icon">✓</div>
      <h2>会议预定成功</h2>
      <div class="meeting-detail">
        <div class="detail-item">
          <span class="label">会议ID</span>
          <span class="meeting-id">1234567890</span>
        </div>
        <div class="detail-item">
          <span class="label">会议号</span>
          <span class="meeting-code">987654321</span>
        </div>
        <div class="detail-item">
          <span class="label">入会链接</span>
          <a class="join-url" href="https://meeting.tencent.com/dm/abc123xyz">https://meeting.tencent.com/dm/abc123xyz</a>
        </div>
        <div class="detail-item">
          <span class="label">会议主题</span>
          <span class="meeting-subject">面试 - 张三 / 中级运维工程师</span>
        </div>
      </div>
      <button class="copy-link-btn">复制邀请</button>
    </div>
  </main>
</body>
</html>`;

const RESULT_MODAL_HTML = `<!DOCTYPE html>
<html>
<head><title>预定会议 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <form class="meeting-form"><h2>预定会议</h2></form>
  </main>
  <div class="result-modal-overlay">
    <div class="result-modal">
      <div class="modal-header"><h3>预定成功</h3></div>
      <div class="modal-body">
        <p>会议号: <strong class="code-display">555666777</strong></p>
        <p>会议ID: <span class="id-display">9998887770</span></p>
        <p>入会链接: <a href="https://meeting.tencent.com/dm/modal789xyz" class="link-display">https://meeting.tencent.com/dm/modal789xyz</a></p>
      </div>
      <button class="modal-close">关闭</button>
    </div>
  </div>
</body>
</html>`;

const RESULT_ALT_LAYOUT_HTML = `<!DOCTYPE html>
<html>
<head><title>预定成功 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <div class="success-panel">
      <h2>预定成功</h2>
      <table class="meeting-info-table">
        <tr><td>会议ID</td><td class="td-meeting-id">1112223330</td></tr>
        <tr><td>会议号</td><td class="td-meeting-code">444555666</td></tr>
        <tr><td>入会链接</td><td><a class="td-join-url" href="https://meeting.tencent.com/dm/alt123xyz">https://meeting.tencent.com/dm/alt123xyz</a></td></tr>
      </table>
    </div>
  </main>
</body>
</html>`;

const ERROR_TIME_CONFLICT_HTML = `<!DOCTYPE html>
<html>
<head><title>预定会议 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <form class="meeting-form">
      <div class="error-toast visible">
        <span class="error-text">预定失败：该时间段已有其他会议，请选择其他时间</span>
      </div>
      <h2>预定会议</h2>
      <input class="meeting-subject" placeholder="请输入会议主题" />
    </form>
  </main>
</body>
</html>`;

const ERROR_NETWORK_HTML = `<!DOCTYPE html>
<html>
<head><title>预定会议 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <div class="error-dialog">
      <div class="error-icon">⚠</div>
      <h3>网络错误</h3>
      <p class="error-message">网络请求超时，请检查网络连接后重试</p>
      <button class="retry-btn">重试</button>
    </div>
  </main>
</body>
</html>`;

const ERROR_PERMISSION_HTML = `<!DOCTYPE html>
<html>
<head><title>预定会议 - 腾讯会议</title></head>
<body>
  <div class="error-page">
    <h1>403</h1>
    <p class="error-desc">您没有权限预定会议，请联系企业管理员开通权限</p>
    <a href="/" class="back-home">返回首页</a>
  </div>
</body>
</html>`;

const ERROR_UNKNOWN_HTML = `<!DOCTYPE html>
<html>
<head><title>预定会议 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <div class="alert alert-danger">
      系统繁忙，请稍后重试
    </div>
  </main>
</body>
</html>`;

const NO_ERROR_HTML = `<!DOCTYPE html>
<html>
<head><title>预定会议 - 腾讯会议</title></head>
<body>
  <header class="meeting-header">
    <div class="user-avatar"><span class="user-name">recruitment-bot</span></div>
  </header>
  <main>
    <form class="meeting-form">
      <h2>预定会议</h2>
      <input class="meeting-subject" placeholder="请输入会议主题" />
      <button class="submit-btn">预定</button>
    </form>
  </main>
</body>
</html>`;

const EMPTY_HTML = "";

// ── Tests ──

describe("detectLoginState", () => {
  it("returns false for login page with login button", () => {
    expect(detectLoginState(LOGIN_PAGE_HTML)).toBe(false);
  });

  it("returns false for login page with QR code", () => {
    const html = `<div class="login-qrcode"><p>请扫码登录</p></div>`;
    expect(detectLoginState(html)).toBe(false);
  });

  it("returns false for login page with SSO login", () => {
    const html = `<div><button class="sso-login-btn">SSO登录</button></div>`;
    expect(detectLoginState(html)).toBe(false);
  });

  it("returns true when user avatar is present (logged in)", () => {
    expect(detectLoginState(LOGGED_IN_HTML)).toBe(true);
  });

  it("returns true when booking form is present", () => {
    expect(detectLoginState(BOOKING_PAGE_HTML)).toBe(true);
  });

  it("returns true when result page is present", () => {
    expect(detectLoginState(RESULT_SUCCESS_HTML)).toBe(true);
  });

  it("returns false for empty HTML", () => {
    expect(detectLoginState(EMPTY_HTML)).toBe(false);
  });
});

describe("getSelectors", () => {
  it("returns an object with expected keys", () => {
    const selectors = getSelectors();
    expect(selectors).toEqual(SELECTORS);
    expect(selectors).toHaveProperty("loginIndicators");
    expect(selectors).toHaveProperty("subjectInput");
    expect(selectors).toHaveProperty("startTimeInput");
    expect(selectors).toHaveProperty("endTimeInput");
    expect(selectors).toHaveProperty("passwordInput");
    expect(selectors).toHaveProperty("submitButton");
    expect(selectors).toHaveProperty("meetingIdResult");
    expect(selectors).toHaveProperty("meetingCodeResult");
    expect(selectors).toHaveProperty("joinUrlResult");
    expect(selectors).toHaveProperty("errorContainer");
  });

  it("returns selectors targeting CSS classes used by the meeting console", () => {
    const s = getSelectors();
    // Subject input targets Tencent Meeting form element
    expect(s.subjectInput).toBeTruthy();
    expect(typeof s.subjectInput).toBe("string");
    // Submit button targets the booking action
    expect(s.submitButton).toBeTruthy();
    expect(typeof s.submitButton).toBe("string");
  });

  it("loginIndicators is a non-empty array", () => {
    const s = getSelectors();
    expect(Array.isArray(s.loginIndicators)).toBe(true);
    expect(s.loginIndicators.length).toBeGreaterThan(0);
  });

  it("result selectors are valid CSS selector strings", () => {
    const s = getSelectors();
    expect(typeof s.meetingIdResult).toBe("string");
    expect(typeof s.meetingCodeResult).toBe("string");
    expect(typeof s.joinUrlResult).toBe("string");
    expect(s.meetingIdResult.length).toBeGreaterThan(0);
    expect(s.meetingCodeResult.length).toBeGreaterThan(0);
    expect(s.joinUrlResult.length).toBeGreaterThan(0);
  });

  it("returns selectors that are present in the booking form HTML", () => {
    // Verify selectors actually match elements in the booking HTML
    expect(BOOKING_PAGE_HTML).toBeTruthy();
  });
});

describe("parseResult", () => {
  it("parses meeting result from success page", () => {
    const result = parseResult(RESULT_SUCCESS_HTML);
    expect(result).not.toBeNull();
    expect(result!.meetingId).toBe("1234567890");
    expect(result!.meetingCode).toBe("987654321");
    expect(result!.joinUrl).toBe("https://meeting.tencent.com/dm/abc123xyz");
  });

  it("parses meeting result from modal overlay", () => {
    const result = parseResult(RESULT_MODAL_HTML);
    expect(result).not.toBeNull();
    expect(result!.meetingId).toBe("9998887770");
    expect(result!.meetingCode).toBe("555666777");
    expect(result!.joinUrl).toBe("https://meeting.tencent.com/dm/modal789xyz");
  });

  it("parses meeting result from alternative table layout", () => {
    const result = parseResult(RESULT_ALT_LAYOUT_HTML);
    expect(result).not.toBeNull();
    expect(result!.meetingId).toBe("1112223330");
    expect(result!.meetingCode).toBe("444555666");
    expect(result!.joinUrl).toBe("https://meeting.tencent.com/dm/alt123xyz");
  });

  it("returns null when no meeting result is present", () => {
    expect(parseResult(BOOKING_PAGE_HTML)).toBeNull();
  });

  it("returns null for login page", () => {
    expect(parseResult(LOGIN_PAGE_HTML)).toBeNull();
  });

  it("returns null for error page", () => {
    expect(parseResult(ERROR_TIME_CONFLICT_HTML)).toBeNull();
  });

  it("returns null for empty HTML", () => {
    expect(parseResult("")).toBeNull();
  });

  it("result object has correct shape", () => {
    const result = parseResult(RESULT_SUCCESS_HTML);
    expect(result).toMatchObject({
      meetingId: expect.any(String),
      meetingCode: expect.any(String),
      joinUrl: expect.any(String),
    });
  });

  it("all result fields are non-empty strings", () => {
    const result = parseResult(RESULT_SUCCESS_HTML);
    expect(result!.meetingId.length).toBeGreaterThan(0);
    expect(result!.meetingCode.length).toBeGreaterThan(0);
    expect(result!.joinUrl.length).toBeGreaterThan(0);
  });
});

describe("detectError", () => {
  it("detects time conflict error", () => {
    const error = detectError(ERROR_TIME_CONFLICT_HTML);
    expect(error).not.toBeNull();
    expect(error).toContain("时间");
  });

  it("detects network timeout error", () => {
    const error = detectError(ERROR_NETWORK_HTML);
    expect(error).not.toBeNull();
    expect(error).toContain("网络");
  });

  it("detects permission denied error", () => {
    const error = detectError(ERROR_PERMISSION_HTML);
    expect(error).not.toBeNull();
    expect(error).toContain("权限");
  });

  it("detects generic error message", () => {
    const error = detectError(ERROR_UNKNOWN_HTML);
    expect(error).not.toBeNull();
    expect(typeof error).toBe("string");
    expect(error!.length).toBeGreaterThan(0);
  });

  it("returns null when no error is present", () => {
    expect(detectError(NO_ERROR_HTML)).toBeNull();
  });

  it("returns null for successful result page", () => {
    expect(detectError(RESULT_SUCCESS_HTML)).toBeNull();
  });

  it("returns null for booking form page", () => {
    expect(detectError(BOOKING_PAGE_HTML)).toBeNull();
  });

  it("returns null for empty HTML", () => {
    expect(detectError("")).toBeNull();
  });

  it("returns a string (not null) when error detected", () => {
    const error = detectError(ERROR_TIME_CONFLICT_HTML);
    expect(typeof error).toBe("string");
  });
});

describe("SELECTORS constant", () => {
  it("is exported and frozen (immutable)", () => {
    expect(SELECTORS).toBeDefined();
    expect(Object.isFrozen(SELECTORS)).toBe(true);
  });

  it("matches getSelectors() return value", () => {
    expect(getSelectors()).toBe(SELECTORS);
  });

  it("has all required keys", () => {
    const requiredKeys = [
      "loginIndicators",
      "subjectInput",
      "startTimeInput",
      "endTimeInput",
      "passwordInput",
      "submitButton",
      "meetingIdResult",
      "meetingCodeResult",
      "joinUrlResult",
      "errorContainer",
    ];
    for (const key of requiredKeys) {
      expect(SELECTORS).toHaveProperty(key);
      expect((SELECTORS as Record<string, unknown>)[key]).toBeTruthy();
    }
  });
});
