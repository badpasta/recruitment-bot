# ZHU-5: Email Push & Reply Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send screened-pass candidate resumes via email (阿里企业邮箱 SMTP) and monitor replies for action keywords (约面试/淘汰) via IMAP.

**Architecture:** New `src/email/` module with transport abstraction (interfaces for SMTP/IMAP). EmailSender queries `screening_results` for `passed` candidates not yet emailed, sends formatted HTML, logs to `email_log` table. ReplyMonitor checks IMAP for unread replies, matches keywords, updates screening status. Both integrated into the existing Scheduler's `fullRound()` callback.

**Tech Stack:** nodemailer (SMTP), imapflow (IMAP), mailparser (body parsing), better-sqlite3 (email_log table)

---

## File Structure

### New files
- `src/email/types.ts` — EmailTransport + ImapClient interfaces, EmailConfig type
- `src/email/keywords.ts` — Keyword detection logic (pure function)
- `src/email/template.ts` — HTML email body builder (pure function)
- `src/email/sender.ts` — EmailSender class (SMTP send + pending query)
- `src/email/monitor.ts` — ReplyMonitor class (IMAP check + keyword match)
- `src/store/email-log.ts` — EmailLogStore (email_log table CRUD)
- `tests/email/keywords.test.ts`
- `tests/email/template.test.ts`
- `tests/email/sender.test.ts`
- `tests/email/monitor.test.ts`
- `tests/store/email-log.test.ts`

### Modified files
- `src/types/index.ts` — Add EmailConfig, EmailLogEntry, extend ScreeningStatus, extend AppConfig
- `src/store/db.ts` — Add email_log table DDL, extend screening_results CHECK constraint
- `src/store/results.ts` — Add getPassedUnsent() method
- `src/config/loader.ts` — Validate email section
- `config/screening.yaml` — Add email section
- `src/index.ts` — Wire EmailSender + ReplyMonitor, extend scanRound → fullRound
- `package.json` — Add nodemailer, imapflow, mailparser deps

---

### Task 1: Types & Database Schema

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/db.ts`
- Test: `tests/store/db.test.ts`

- [ ] **Step 1: Write failing tests for new types and schema**

In `tests/store/db.test.ts`, add tests for email_log table:

```typescript
describe("email_log table", () => {
  it("creates email_log table on init", () => {
    const db = initDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_log'")
      .all();
    expect(tables.length).toBe(1);
  });

  it("email_log has correct columns", () => {
    const db = initDatabase(":memory:");
    const columns = db.prepare("PRAGMA table_info(email_log)").all() as { name: string }[];
    const names = columns.map((c) => c.name);
    expect(names).toContain("candidate_id");
    expect(names).toContain("direction");
    expect(names).toContain("message_id");
    expect(names).toContain("keyword_detected");
  });

  it("screening_results accepts 'interview' and 'eliminated' status", () => {
    const db = initDatabase(":memory:");
    db.exec(`INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', 'Test', '', '{}')`);
    db.exec(`INSERT INTO screening_results (candidate_id, position_name, status, score, match_details) VALUES ('c1', 'pos', 'interview', 0, '{}')`);
    db.exec(`INSERT INTO screening_results (candidate_id, position_name, status, score, match_details) VALUES ('c1', 'pos2', 'eliminated', 0, '{}')`);
    const rows = db.prepare("SELECT status FROM screening_results").all() as { status: string }[];
    expect(rows.map((r) => r.status)).toEqual(["interview", "eliminated"]);
  });
});
```

In `tests/types/index.test.ts`, add tests:

```typescript
describe("ScreeningStatus extended values", () => {
  it("accepts 'interview' as valid status", () => {
    expect(isValidScreeningStatus("interview")).toBe(true);
  });

  it("accepts 'eliminated' as valid status", () => {
    expect(isValidScreeningStatus("eliminated")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store/db.test.ts tests/types/index.test.ts`
Expected: FAIL — email_log table doesn't exist, interview/eliminated not valid

- [ ] **Step 3: Extend ScreeningStatus type**

In `src/types/index.ts`:

```typescript
export type ScreeningStatus = "passed" | "rejected" | "pending" | "interview" | "eliminated";

const VALID_STATUSES: ScreeningStatus[] = ["passed", "rejected", "pending", "interview", "eliminated"];
```

Add email config types:

```typescript
export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromName: string;
  to: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  replyKeywords: Record<string, string[]>;
}

export interface EmailLogEntry {
  id?: number;
  candidateId: string;
  positionName: string;
  direction: "sent" | "received";
  messageId?: string;
  inReplyTo?: string;
  subject?: string;
  body?: string;
  keywordDetected?: string;
  statusUpdated: boolean;
  processedAt?: string;
}

export interface AppConfig {
  positions: PositionConfig[];
  email?: EmailConfig;
}
```

- [ ] **Step 4: Update database schema**

In `src/store/db.ts`, add to the `db.exec()` block:

```sql
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  position_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('sent', 'received')),
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  subject TEXT,
  body TEXT,
  keyword_detected TEXT,
  status_updated INTEGER DEFAULT 0,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_log_candidate
  ON email_log(candidate_id);

CREATE INDEX IF NOT EXISTS idx_email_log_message_id
  ON email_log(message_id);
```

For the screening_results CHECK constraint migration, add after the CREATE TABLE IF NOT EXISTS statements:

```typescript
// Migrate screening_results CHECK constraint to include new statuses
const existingCheck = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type='table' AND name='screening_results'
`).get() as { sql: string } | undefined;

if (existingCheck && !existingCheck.sql.includes("'interview'")) {
  db.exec(`
    CREATE TABLE screening_results_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('passed', 'rejected', 'pending', 'interview', 'eliminated')),
      score INTEGER NOT NULL DEFAULT 0,
      match_details JSON NOT NULL,
      screened_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO screening_results_new SELECT * FROM screening_results;
    DROP TABLE screening_results;
    ALTER TABLE screening_results_new RENAME TO screening_results;
    CREATE INDEX IF NOT EXISTS idx_screening_results_status ON screening_results(status);
    CREATE INDEX IF NOT EXISTS idx_screening_results_candidate ON screening_results(candidate_id);
  `);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/store/db.test.ts tests/types/index.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/store/db.ts tests/store/db.test.ts tests/types/index.test.ts
git commit -m "feat(zhu5): extend types and DB schema for email log"
```

---

### Task 2: EmailLogStore

**Files:**
- Create: `src/store/email-log.ts`
- Test: `tests/store/email-log.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { initDatabase } from "../../src/store/db.js";
import { EmailLogStore } from "../../src/store/email-log.js";
import type Database from "better-sqlite3";

describe("EmailLogStore", () => {
  let db: Database.Database;
  let store: EmailLogStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new EmailLogStore(db);
    // Seed a candidate
    db.exec(`INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', '张三', '', '{}')`);
  });

  it("inserts a sent entry", () => {
    const id = store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<msg-001@test>",
      subject: "Test subject",
      body: "<p>Test body</p>",
      statusUpdated: false,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("hasSent returns true after inserting sent entry", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<msg-001@test>",
      statusUpdated: false,
    });
    expect(store.hasSent("c1", "运维工程师")).toBe(true);
  });

  it("hasSent returns false for unsent candidate", () => {
    expect(store.hasSent("c1", "运维工程师")).toBe(false);
  });

  it("findByMessageId returns entry when found", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<msg-001@test>",
      statusUpdated: false,
    });
    const entry = store.findByMessageId("<msg-001@test>");
    expect(entry).not.toBeNull();
    expect(entry!.candidateId).toBe("c1");
  });

  it("findByMessageId returns null when not found", () => {
    expect(store.findByMessageId("<nonexistent>")).toBeNull();
  });

  it("inserts received entry with keyword", () => {
    const id = store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "received",
      messageId: "<reply-001@test>",
      inReplyTo: "<msg-001@test>",
      keywordDetected: "interview",
      statusUpdated: true,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("hasReceivedMessage returns true for existing message_id", () => {
    store.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "received",
      messageId: "<reply-001@test>",
      statusUpdated: false,
    });
    expect(store.hasReceivedMessage("<reply-001@test>")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store/email-log.test.ts`
Expected: FAIL — EmailLogStore module not found

- [ ] **Step 3: Implement EmailLogStore**

Create `src/store/email-log.ts`:

```typescript
import type Database from "better-sqlite3";
import type { EmailLogEntry } from "../types/index.js";

interface EmailLogRow {
  id: number;
  candidate_id: string;
  position_name: string;
  direction: string;
  message_id: string | null;
  in_reply_to: string | null;
  subject: string | null;
  body: string | null;
  keyword_detected: string | null;
  status_updated: number;
  processed_at: string;
}

export class EmailLogStore {
  constructor(private db: Database.Database) {}

  insert(entry: EmailLogEntry): number {
    const stmt = this.db.prepare(`
      INSERT INTO email_log (candidate_id, position_name, direction, message_id, in_reply_to, subject, body, keyword_detected, status_updated)
      VALUES (@candidateId, @positionName, @direction, @messageId, @inReplyTo, @subject, @body, @keywordDetected, @statusUpdated)
    `);
    const info = stmt.run({
      candidateId: entry.candidateId,
      positionName: entry.positionName,
      direction: entry.direction,
      messageId: entry.messageId ?? null,
      inReplyTo: entry.inReplyTo ?? null,
      subject: entry.subject ?? null,
      body: entry.body ?? null,
      keywordDetected: entry.keywordDetected ?? null,
      statusUpdated: entry.statusUpdated ? 1 : 0,
    });
    return info.lastInsertRowid as number;
  }

  hasSent(candidateId: string, positionName: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM email_log WHERE candidate_id = ? AND position_name = ? AND direction = 'sent'")
      .get(candidateId, positionName);
    return row !== undefined;
  }

  findByMessageId(messageId: string): EmailLogEntry | null {
    const row = this.db
      .prepare("SELECT * FROM email_log WHERE message_id = ?")
      .get(messageId) as EmailLogRow | undefined;
    if (!row) return null;
    return this.rowToEntry(row);
  }

  hasReceivedMessage(messageId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM email_log WHERE message_id = ? AND direction = 'received'")
      .get(messageId);
    return row !== undefined;
  }

  private rowToEntry(row: EmailLogRow): EmailLogEntry {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      direction: row.direction as "sent" | "received",
      messageId: row.message_id ?? undefined,
      inReplyTo: row.in_reply_to ?? undefined,
      subject: row.subject ?? undefined,
      body: row.body ?? undefined,
      keywordDetected: row.keyword_detected ?? undefined,
      statusUpdated: row.status_updated === 1,
      processedAt: row.processed_at,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/store/email-log.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/email-log.ts tests/store/email-log.test.ts
git commit -m "feat(zhu5): add EmailLogStore for email tracking"
```

---

### Task 3: Keyword Matching

**Files:**
- Create: `src/email/keywords.ts`
- Test: `tests/email/keywords.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/email/keywords.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement keyword detection**

Create `src/email/keywords.ts`:

```typescript
/**
 * Detect action keywords in email body text.
 * Returns the matched category name, or "none" if no match.
 * Interview keywords have priority over eliminated when both appear.
 */
export function detectKeyword(
  body: string,
  keywords: Record<string, string[]>,
): string {
  if (!body) return "none";
  const lowerBody = body.toLowerCase();

  // Check interview keywords first (higher priority)
  const interviewKeywords = keywords["interview"] ?? [];
  for (const kw of interviewKeywords) {
    if (lowerBody.includes(kw.toLowerCase())) return "interview";
  }

  // Check eliminated keywords
  const eliminatedKeywords = keywords["eliminated"] ?? [];
  for (const kw of eliminatedKeywords) {
    if (lowerBody.includes(kw.toLowerCase())) return "eliminated";
  }

  return "none";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/email/keywords.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/email/keywords.ts tests/email/keywords.test.ts
git commit -m "feat(zhu5): add email keyword detection"
```

---

### Task 4: Email Template

**Files:**
- Create: `src/email/template.ts`
- Test: `tests/email/template.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { buildEmailSubject, buildEmailBody } from "../../src/email/template.js";
import type { Candidate, ScreeningResult } from "../../src/types/index.js";

const mockCandidate: Candidate = {
  id: "c1",
  name: "张三",
  profileUrl: "https://zhipin.com/geek/c1",
  rawProfile: {
    skills: ["k8s", "docker"],
    status: "在职-考虑机会",
    experienceYears: 4,
    salaryExpectation: 17000,
    workHistory: [{ company: "公司A", title: "运维工程师" }],
    projectHistory: [],
  },
};

const mockResult: ScreeningResult = {
  candidateId: "c1",
  positionName: "中级运维工程师_北京 16-18k",
  status: "passed",
  score: 25,
  matchDetails: {
    requiredMatched: [],
    preferredMatched: [],
    totalScore: 25,
    threshold: 15,
  },
};

describe("buildEmailSubject", () => {
  it("formats subject with position, name, and score", () => {
    const subject = buildEmailSubject(mockResult);
    expect(subject).toBe("[招聘筛选] 中级运维工程师_北京 16-18k - 张三 (匹配度: 25分)");
  });
});

describe("buildEmailBody", () => {
  it("returns HTML containing candidate name", () => {
    const html = buildEmailBody(mockCandidate, mockResult);
    expect(html).toContain("张三");
  });

  it("returns HTML containing position name", () => {
    const html = buildEmailBody(mockCandidate, mockResult);
    expect(html).toContain("中级运维工程师_北京 16-18k");
  });

  it("returns HTML containing score", () => {
    const html = buildEmailBody(mockCandidate, mockResult);
    expect(html).toContain("25");
  });

  it("returns HTML containing skills", () => {
    const html = buildEmailBody(mockCandidate, mockResult);
    expect(html).toContain("k8s");
    expect(html).toContain("docker");
  });

  it("returns HTML containing work history", () => {
    const html = buildEmailBody(mockCandidate, mockResult);
    expect(html).toContain("公司A");
  });

  it("returns valid HTML with table structure", () => {
    const html = buildEmailBody(mockCandidate, mockResult);
    expect(html).toContain("<table");
    expect(html).toContain("</table>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/email/template.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement template functions**

Create `src/email/template.ts`:

```typescript
import type { Candidate, ScreeningResult } from "../types/index.js";

export function buildEmailSubject(result: ScreeningResult): string {
  return `[招聘筛选] ${result.positionName} - ${result.candidateId} (匹配度: ${result.score}分)`;
}

// Overload that accepts candidate name for the subject
export function buildEmailSubjectWithName(result: ScreeningResult, candidateName: string): string {
  return `[招聘筛选] ${result.positionName} - ${candidateName} (匹配度: ${result.score}分)`;
}

export function buildEmailBody(candidate: Candidate, result: ScreeningResult): string {
  const profile = candidate.rawProfile;
  const skills = profile.skills.length > 0 ? profile.skills.join(", ") : "未提取";
  const experience = profile.experienceYears != null ? `${profile.experienceYears}年` : "未知";
  const salary = profile.salaryExpectation != null ? `${profile.salaryExpectation / 1000}K` : "面议";
  const status = profile.status ?? "未知";

  const workHistoryRows = profile.workHistory
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.company)}</td><td>${escapeHtml(w.title)}</td><td>${escapeHtml(w.startDate ?? "")}</td></tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Microsoft YaHei', Arial, sans-serif; padding: 20px;">
<h2>招聘筛选结果 - ${escapeHtml(candidate.name)}</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
  <tr><td><strong>姓名</strong></td><td>${escapeHtml(candidate.name)}</td></tr>
  <tr><td><strong>应聘职位</strong></td><td>${escapeHtml(result.positionName)}</td></tr>
  <tr><td><strong>匹配分数</strong></td><td>${result.score}/${result.matchDetails.threshold} (阈值)</td></tr>
  <tr><td><strong>求职状态</strong></td><td>${escapeHtml(status)}</td></tr>
  <tr><td><strong>核心技能</strong></td><td>${escapeHtml(skills)}</td></tr>
  <tr><td><strong>工作年限</strong></td><td>${escapeHtml(experience)}</td></tr>
  <tr><td><strong>期望薪资</strong></td><td>${escapeHtml(salary)}</td></tr>
</table>

${
  workHistoryRows
    ? `<h3>工作经历</h3>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%;">
  <tr><th>公司</th><th>职位</th><th>时间</th></tr>
  ${workHistoryRows}
</table>`
    : ""
}

<p style="color: #888; margin-top: 20px;">
  回复 <strong>"约面试"</strong> 安排面试 | 回复 <strong>"淘汰"</strong> 淘汰该候选人
</p>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Update the subject test to use the name variant**

Update `buildEmailSubject` in `src/email/template.ts` to use candidate name. Modify the subject builder:

```typescript
export function buildEmailSubject(result: ScreeningResult, candidateName: string): string {
  return `[招聘筛选] ${result.positionName} - ${candidateName} (匹配度: ${result.score}分)`;
}
```

Remove the `buildEmailSubjectWithName` overload. Update test:

```typescript
it("formats subject with position, name, and score", () => {
  const subject = buildEmailSubject(mockResult, "张三");
  expect(subject).toBe("[招聘筛选] 中级运维工程师_北京 16-18k - 张三 (匹配度: 25分)");
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/email/template.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/email/template.ts tests/email/template.test.ts
git commit -m "feat(zhu5): add HTML email template builder"
```

---

### Task 5: EmailSender

**Files:**
- Create: `src/email/types.ts`
- Create: `src/email/sender.ts`
- Test: `tests/email/sender.test.ts`

- [ ] **Step 1: Define EmailTransport interface**

Create `src/email/types.ts`:

```typescript
export interface EmailTransport {
  sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

export interface ImapClient {
  connect(): Promise<void>;
  fetchUnseen(): Promise<ImapMessage[]>;
  markSeen(uid: number): Promise<void>;
  disconnect(): Promise<void>;
}

export interface ImapMessage {
  uid: number;
  messageId: string;
  inReplyTo: string;
  subject: string;
  text: string;
}
```

- [ ] **Step 2: Write failing tests for EmailSender**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { EmailSender } from "../../src/email/sender.js";
import type { EmailTransport } from "../../src/email/types.js";
import { initDatabase } from "../../src/store/db.js";
import { EmailLogStore } from "../../src/store/email-log.js";
import { ResultStore } from "../../src/store/results.js";
import { CandidateStore } from "../../src/store/candidates.js";
import type { Candidate, EmailConfig, ScreeningResult } from "../../src/types/index.js";

class MockTransport implements EmailTransport {
  public sentMails: { to: string; subject: string; html: string }[] = [];
  public messageIdCounter = 0;

  async sendMail(options: { to: string; subject: string; html: string }) {
    this.sentMails.push(options);
    this.messageIdCounter++;
    return { messageId: `<mock-${this.messageIdCounter}@test>` };
  }
}

const EMAIL_CONFIG: EmailConfig = {
  smtpHost: "smtp.test.com",
  smtpPort: 465,
  smtpUser: "test@test.com",
  fromName: "Test",
  to: "boss@test.com",
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  replyKeywords: { interview: ["约面试"], eliminated: ["淘汰"] },
};

describe("EmailSender", () => {
  let db: ReturnType<typeof initDatabase>;
  let sender: EmailSender;
  let transport: MockTransport;
  let emailLog: EmailLogStore;
  let resultStore: ResultStore;
  let candidateStore: CandidateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    transport = new MockTransport();
    emailLog = new EmailLogStore(db);
    resultStore = new ResultStore(db);
    candidateStore = new CandidateStore(db);
    sender = new EmailSender(transport, emailLog, resultStore, candidateStore, EMAIL_CONFIG);

    // Seed data
    candidateStore.upsert({
      id: "c1",
      name: "张三",
      profileUrl: "",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
  });

  it("sends email for passed candidate not yet emailed", async () => {
    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "passed",
      score: 20,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 },
    };
    resultStore.insert(result);

    const sent = await sender.sendPending("运维工程师");
    expect(sent).toBe(1);
    expect(transport.sentMails.length).toBe(1);
    expect(transport.sentMails[0].to).toBe("boss@test.com");
    expect(transport.sentMails[0].subject).toContain("张三");
  });

  it("skips already-emailed candidates", async () => {
    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "passed",
      score: 20,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 },
    };
    resultStore.insert(result);

    await sender.sendPending("运维工程师");
    const sent2 = await sender.sendPending("运维工程师");
    expect(sent2).toBe(0);
    expect(transport.sentMails.length).toBe(1);
  });

  it("does not send for rejected candidates", async () => {
    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "rejected",
      score: 5,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 5, threshold: 15 },
    };
    resultStore.insert(result);

    const sent = await sender.sendPending("运维工程师");
    expect(sent).toBe(0);
    expect(transport.sentMails.length).toBe(0);
  });

  it("handles transport failure gracefully", async () => {
    const failTransport: EmailTransport = {
      sendMail: async () => { throw new Error("SMTP connection failed"); },
    };
    const failSender = new EmailSender(failTransport, emailLog, resultStore, candidateStore, EMAIL_CONFIG);

    const result: ScreeningResult = {
      candidateId: "c1",
      positionName: "运维工程师",
      status: "passed",
      score: 20,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 },
    };
    resultStore.insert(result);

    // Should not throw
    const sent = await failSender.sendPending("运维工程师");
    expect(sent).toBe(0);
    // Should not have logged to email_log
    expect(emailLog.hasSent("c1", "运维工程师")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/email/sender.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Add getPassedUnsent to ResultStore**

In `src/store/results.ts`, add:

```typescript
getPassedWithoutSent(positionName: string, hasSentFn: (candidateId: string) => boolean): ScreeningResult[] {
  const rows = this.db
    .prepare("SELECT * FROM screening_results WHERE status = 'passed' AND position_name = ? ORDER BY screened_at DESC")
    .all(positionName) as ResultRow[];
  return rows
    .filter((row) => !hasSentFn(row.candidate_id))
    .map((row) => ({
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      status: row.status as ScreeningStatus,
      score: row.score,
      matchDetails: JSON.parse(row.match_details),
      screenedAt: row.screened_at,
    }));
}
```

- [ ] **Step 5: Implement EmailSender**

Create `src/email/sender.ts`:

```typescript
import type { EmailTransport } from "./types.js";
import type { EmailLogStore } from "../store/email-log.js";
import type { ResultStore } from "../store/results.js";
import type { CandidateStore } from "../store/candidates.js";
import type { EmailConfig } from "../types/index.js";
import { buildEmailSubject, buildEmailBody } from "./template.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("email-sender");

export class EmailSender {
  constructor(
    private transport: EmailTransport,
    private emailLog: EmailLogStore,
    private resultStore: ResultStore,
    private candidateStore: CandidateStore,
    private config: EmailConfig,
  ) {}

  async sendPending(positionName: string): Promise<number> {
    const results = this.resultStore.getPassedWithoutSent(
      positionName,
      (cid) => this.emailLog.hasSent(cid, positionName),
    );

    let sent = 0;
    for (const result of results) {
      const candidate = this.candidateStore.getById(result.candidateId);
      if (!candidate) {
        log.warn(`Candidate ${result.candidateId} not found in store, skipping`);
        continue;
      }

      try {
        const subject = buildEmailSubject(result, candidate.name);
        const html = buildEmailBody(candidate, result);

        const { messageId } = await this.transport.sendMail({
          to: this.config.to,
          subject,
          html,
        });

        this.emailLog.insert({
          candidateId: result.candidateId,
          positionName,
          direction: "sent",
          messageId,
          subject,
          body: html,
          statusUpdated: false,
        });

        sent++;
        log.info(`Sent email for ${candidate.name} (messageId: ${messageId})`);
      } catch (err) {
        log.error(`Failed to send email for ${candidate.name}: ${err}`);
      }
    }

    if (sent > 0) log.info(`Sent ${sent} email(s) this round`);
    return sent;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/email/sender.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/email/types.ts src/email/sender.ts src/store/results.ts tests/email/sender.test.ts
git commit -m "feat(zhu5): add EmailSender with transport abstraction"
```

---

### Task 6: ReplyMonitor

**Files:**
- Create: `src/email/monitor.ts`
- Test: `tests/email/monitor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ReplyMonitor } from "../../src/email/monitor.js";
import type { ImapClient, ImapMessage } from "../../src/email/types.js";
import { initDatabase } from "../../src/store/db.js";
import { EmailLogStore } from "../../src/store/email-log.js";
import { ResultStore } from "../../src/store/results.js";
import type { EmailConfig, ScreeningResult } from "../../src/types/index.js";

class MockImapClient implements ImapClient {
  public messages: ImapMessage[] = [];
  public markedSeen: number[] = [];
  public connected = false;

  async connect() { this.connected = true; }
  async fetchUnseen() { return this.messages; }
  async markSeen(uid: number) { this.markedSeen.push(uid); }
  async disconnect() { this.connected = false; }
}

const EMAIL_CONFIG: EmailConfig = {
  smtpHost: "", smtpPort: 465, smtpUser: "", fromName: "", to: "",
  imapHost: "imap.test.com", imapPort: 993, imapUser: "test@test.com",
  replyKeywords: { interview: ["约面试"], eliminated: ["淘汰"] },
};

describe("ReplyMonitor", () => {
  let db: ReturnType<typeof initDatabase>;
  let monitor: ReplyMonitor;
  let imapClient: MockImapClient;
  let emailLog: EmailLogStore;
  let resultStore: ResultStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    imapClient = new MockImapClient();
    emailLog = new EmailLogStore(db);
    resultStore = new ResultStore(db);
    monitor = new ReplyMonitor(imapClient, emailLog, resultStore, EMAIL_CONFIG);

    // Seed: a sent email that can be replied to
    db.exec(`INSERT INTO candidates (id, name, profile_url, raw_profile) VALUES ('c1', '张三', '', '{}')`);
    emailLog.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "sent",
      messageId: "<sent-001@test>",
      statusUpdated: false,
    });
  });

  it("processes reply with interview keyword and updates status", async () => {
    imapClient.messages = [{
      uid: 1,
      messageId: "<reply-001@test>",
      inReplyTo: "<sent-001@test>",
      subject: "Re: 招聘筛选",
      text: "好的，约面试吧",
    }];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(1);

    // Check status was updated
    const results = resultStore.getByStatus("interview");
    expect(results.length).toBe(1);
    expect(results[0].candidateId).toBe("c1");

    // Check email was marked seen
    expect(imapClient.markedSeen).toContain(1);

    // Check email_log has received entry
    expect(emailLog.hasReceivedMessage("<reply-001@test>")).toBe(true);
  });

  it("processes reply with eliminated keyword", async () => {
    imapClient.messages = [{
      uid: 1,
      messageId: "<reply-002@test>",
      inReplyTo: "<sent-001@test>",
      subject: "Re: 招聘筛选",
      text: "不合适，淘汰",
    }];

    await monitor.checkReplies();
    const results = resultStore.getByStatus("eliminated");
    expect(results.length).toBe(1);
  });

  it("skips messages with no matching keyword", async () => {
    imapClient.messages = [{
      uid: 1,
      messageId: "<reply-003@test>",
      inReplyTo: "<sent-001@test>",
      subject: "Re: 招聘筛选",
      text: "收到，谢谢",
    }];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(1); // Still processed, just no keyword match

    // Status should NOT be updated
    const results = resultStore.getByStatus("interview");
    expect(results.length).toBe(0);
  });

  it("skips already-processed messages (by message_id)", async () => {
    // Pre-insert the received message
    emailLog.insert({
      candidateId: "c1",
      positionName: "运维工程师",
      direction: "received",
      messageId: "<reply-001@test>",
      statusUpdated: false,
    });

    imapClient.messages = [{
      uid: 1,
      messageId: "<reply-001@test>",
      inReplyTo: "<sent-001@test>",
      subject: "Re: 招聘筛选",
      text: "约面试",
    }];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(0);
  });

  it("skips replies that cannot be matched to a sent email", async () => {
    imapClient.messages = [{
      uid: 1,
      messageId: "<reply-unknown@test>",
      inReplyTo: "<nonexistent-sent@test>",
      subject: "Re: something else",
      text: "约面试",
    }];

    const processed = await monitor.checkReplies();
    expect(processed).toBe(0);
  });

  it("handles IMAP connection failure gracefully", async () => {
    const failClient: ImapClient = {
      connect: async () => { throw new Error("IMAP connection refused"); },
      fetchUnseen: async () => [],
      markSeen: async () => {},
      disconnect: async () => {},
    };
    const failMonitor = new ReplyMonitor(failClient, emailLog, resultStore, EMAIL_CONFIG);

    // Should not throw
    const processed = await failMonitor.checkReplies();
    expect(processed).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/email/monitor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ReplyMonitor**

Create `src/email/monitor.ts`:

```typescript
import type { ImapClient } from "./types.js";
import type { EmailLogStore } from "../store/email-log.js";
import type { ResultStore } from "../store/results.js";
import type { EmailConfig, ScreeningStatus } from "../types/index.js";
import { detectKeyword } from "./keywords.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("reply-monitor");

export class ReplyMonitor {
  constructor(
    private imapClient: ImapClient,
    private emailLog: EmailLogStore,
    private resultStore: ResultStore,
    private config: EmailConfig,
  ) {}

  async checkReplies(): Promise<number> {
    try {
      await this.imapClient.connect();
    } catch (err) {
      log.error(`IMAP connection failed: ${err}`);
      return 0;
    }

    try {
      const messages = await this.imapClient.fetchUnseen();
      let processed = 0;

      for (const msg of messages) {
        // Skip already-processed messages
        if (this.emailLog.hasReceivedMessage(msg.messageId)) {
          continue;
        }

        // Find the original sent email via In-Reply-To
        if (!msg.inReplyTo) {
          log.warn(`Email ${msg.messageId} has no In-Reply-To, skipping`);
          continue;
        }

        const original = this.emailLog.findByMessageId(msg.inReplyTo);
        if (!original || original.direction !== "sent") {
          log.warn(`Cannot match reply ${msg.messageId} to sent email ${msg.inReplyTo}`);
          continue;
        }

        // Detect keyword
        const keyword = detectKeyword(msg.text, this.config.replyKeywords);

        // Update screening status if keyword matched
        let statusUpdated = false;
        if (keyword === "interview" || keyword === "eliminated") {
          this.resultStore.updateStatus(
            original.candidateId,
            original.positionName,
            keyword as ScreeningStatus,
          );
          statusUpdated = true;
          log.info(`Updated ${original.candidateId} status to '${keyword}'`);
        }

        // Log to email_log
        this.emailLog.insert({
          candidateId: original.candidateId,
          positionName: original.positionName,
          direction: "received",
          messageId: msg.messageId,
          inReplyTo: msg.inReplyTo,
          subject: msg.subject,
          body: msg.text,
          keywordDetected: keyword,
          statusUpdated,
        });

        // Mark as seen
        await this.imapClient.markSeen(msg.uid);
        processed++;
      }

      if (processed > 0) log.info(`Processed ${processed} reply(ies)`);
      return processed;
    } catch (err) {
      log.error(`Reply check failed: ${err}`);
      return 0;
    } finally {
      await this.imapClient.disconnect().catch(() => {});
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/email/monitor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/email/monitor.ts tests/email/monitor.test.ts
git commit -m "feat(zhu5): add ReplyMonitor with IMAP client abstraction"
```

---

### Task 7: Config & Integration

**Files:**
- Modify: `config/screening.yaml`
- Modify: `src/config/loader.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Test: `tests/config/loader.test.ts`

- [ ] **Step 1: Add email section to screening.yaml**

```yaml
positions:
  - name: "中级运维工程师_北京 16-18k"
    boss_url: "https://www.zhipin.com/web/geek/chat"
    screening:
      # ... existing config unchanged ...

email:
  smtp_host: "smtp.mxhichina.com"
  smtp_port: 465
  smtp_user: "wangjingyu@01zhuanche.com"
  from_name: "招聘筛选系统"
  to: "wangjingyu@01zhuanche.com"
  imap_host: "imap.mxhichina.com"
  imap_port: 993
  imap_user: "wangjingyu@01zhuanche.com"
  reply_keywords:
    interview: ["约面试", "安排面试", "可以面试"]
    eliminated: ["淘汰", "不合适", "不考虑"]
```

- [ ] **Step 2: Add config validation for email section**

In `src/config/loader.ts`, extend `validateConfig`:

```typescript
// At the end of validateConfig, add:
if (config.email) {
  const e = config.email;
  if (!e.smtpHost) throw new Error("email.smtpHost is required");
  if (!e.smtpUser) throw new Error("email.smtpUser is required");
  if (!e.to) throw new Error("email.to is required");
  if (!e.imapHost) throw new Error("email.imapHost is required");
  if (!e.imapUser) throw new Error("email.imapUser is required");
}
```

- [ ] **Step 3: Add nodemailer/imapflow/mailparser dependencies**

Run:
```bash
npm install nodemailer imapflow mailparser
npm install -D @types/nodemailer @types/mailparser
```

- [ ] **Step 4: Create NodemailerTransport adapter**

Create `src/email/nodemailer-transport.ts`:

```typescript
import nodemailer from "nodemailer";
import type { EmailTransport } from "./types.js";

export class NodemailerTransport implements EmailTransport {
  private transporter: nodemailer.Transporter;
  private fromAddress: string;

  constructor(smtpHost: string, smtpPort: number, smtpUser: string, password: string, fromName: string) {
    this.fromAddress = `"${fromName}" <${smtpUser}>`;
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: true,
      auth: { user: smtpUser, pass: password },
    });
  }

  async sendMail(options: { to: string; subject: string; html: string }): Promise<{ messageId: string }> {
    const info = await this.transporter.sendMail({
      from: this.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
    return { messageId: info.messageId };
  }
}
```

- [ ] **Step 5: Create ImapFlowClient adapter**

Create `src/email/imapflow-client.ts`:

```typescript
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ImapClient, ImapMessage } from "./types.js";

export class ImapFlowClient implements ImapClient {
  private client: ImapFlow;

  constructor(host: string, port: number, user: string, password: string) {
    this.client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass: password },
      logger: false,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async fetchUnseen(): Promise<ImapMessage[]> {
    const lock = await this.client.getMailboxLock("INBOX");
    try {
      const messages: ImapMessage[] = [];
      for await (const msg of this.client.fetch({ seen: false }, {
        envelope: true,
        source: true,
      })) {
        const parsed = await simpleParser(msg.source);
        messages.push({
          uid: msg.uid,
          messageId: parsed.messageId ?? "",
          inReplyTo: parsed.inReplyTo ?? "",
          subject: parsed.subject ?? "",
          text: parsed.text ?? "",
        });
      }
      return messages;
    } finally {
      lock.release();
    }
  }

  async markSeen(uid: number): Promise<void> {
    await this.client.messageFlagsAdd({ uid }, ["\\Seen"]);
  }

  async disconnect(): Promise<void> {
    await this.client.logout().catch(() => {});
  }
}
```

- [ ] **Step 6: Wire everything in src/index.ts**

Replace the `scanRound` callback with `fullRound`:

```typescript
import { EmailSender } from "./email/sender.js";
import { ReplyMonitor } from "./email/monitor.js";
import { NodemailerTransport } from "./email/nodemailer-transport.js";
import { ImapFlowClient } from "./email/imapflow-client.js";
import { EmailLogStore } from "./store/email-log.js";

// Inside main(), after creating stores:
const emailLogStore = new EmailLogStore(db);
const emailPassword = process.env.EMAIL_PASSWORD ?? "";

let emailSender: EmailSender | null = null;
let replyMonitor: ReplyMonitor | null = null;

if (config.email && emailPassword) {
  const transport = new NodemailerTransport(
    config.email.smtpHost,
    config.email.smtpPort,
    config.email.smtpUser,
    emailPassword,
    config.email.fromName,
  );
  emailSender = new EmailSender(transport, emailLogStore, resultStore, candidateStore, config.email);

  const imapClient = new ImapFlowClient(
    config.email.imapHost,
    config.email.imapPort,
    config.email.imapUser,
    emailPassword,
  );
  replyMonitor = new ReplyMonitor(imapClient, emailLogStore, resultStore, config.email);

  log.info("Email modules initialized (SMTP + IMAP)");
} else if (config.email && !emailPassword) {
  log.warn("EMAIL_PASSWORD not set, email modules disabled");
}

// Replace scanRound with fullRound:
async function fullRound(): Promise<void> {
  // ... existing scanRound logic ...
  await scanRound();

  // Send emails for passed candidates
  if (emailSender) {
    try {
      await emailSender.sendPending(position.name);
    } catch (err) {
      log.error(`Email send round failed: ${err}`);
    }
  }

  // Check for reply emails
  if (replyMonitor) {
    try {
      await replyMonitor.checkReplies();
    } catch (err) {
      log.error(`Reply monitor failed: ${err}`);
    }
  }
}

// Change scheduler callback from scanRound to fullRound:
const scheduler = new Scheduler(fullRound, { intervalMs: SCAN_INTERVAL_MS, maxBackoffMs: 1800000 });
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (existing + new)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(zhu5): integrate email sender and reply monitor into scheduler"
```

---

### Task 8: End-to-End Test

**Files:**
- Modify: `tests/e2e/pipeline.test.ts`

- [ ] **Step 1: Add E2E scenario for email flow**

Add to the existing E2E test file:

```typescript
describe("email integration", () => {
  it("sends email for passed candidate and processes interview reply", async () => {
    // Setup: DB + stores + mock transport/imap
    const db = initDatabase(":memory:");
    const candidateStore = new CandidateStore(db);
    const resultStore = new ResultStore(db);
    const emailLogStore = new EmailLogStore(db);

    // Seed candidate
    candidateStore.upsert({
      id: "c1", name: "张三", profileUrl: "",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });

    // Insert passed screening
    resultStore.insert({
      candidateId: "c1", positionName: "运维",
      status: "passed", score: 20,
      matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 20, threshold: 15 },
    });

    // Send email
    const transport = new MockTransport();
    const emailConfig = {
      smtpHost: "", smtpPort: 465, smtpUser: "", fromName: "", to: "boss@test.com",
      imapHost: "", imapPort: 993, imapUser: "",
      replyKeywords: { interview: ["约面试"], eliminated: ["淘汰"] },
    };
    const sender = new EmailSender(transport, emailLogStore, resultStore, candidateStore, emailConfig);
    await sender.sendPending("运维");
    expect(transport.sentMails.length).toBe(1);

    // Simulate reply
    const messageId = transport.sentMails[0].subject; // Get the sent message ID from transport
    // Use the mock transport's messageId
    const sentLog = emailLogStore.findByMessageId("<mock-1@test>");
    expect(sentLog).not.toBeNull();

    const imapClient = new MockImapClient();
    imapClient.messages = [{
      uid: 1,
      messageId: "<reply-001@test>",
      inReplyTo: "<mock-1@test>",
      subject: "Re: 招聘筛选",
      text: "约面试",
    }];
    const monitor = new ReplyMonitor(imapClient, emailLogStore, resultStore, emailConfig);
    await monitor.checkReplies();

    // Verify status updated to interview
    const results = resultStore.getByStatus("interview");
    expect(results.length).toBe(1);
    expect(results[0].candidateId).toBe("c1");
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npx vitest run tests/e2e/pipeline.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test(zhu5): add E2E test for email send + reply flow"
git push origin HEAD:main
```
