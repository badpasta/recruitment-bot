# Boss直聘简历筛选系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a long-running TypeScript service that automates resume screening from Boss直聘 via browser automation, YAML-based rules, and SQLite persistence.

**Architecture:** Scheduler polls every N minutes → Scraper navigates Boss直聘 via Playwright CDP (connecting to user's logged-in Chrome) → Screener applies YAML rules (required/preferred) → Results stored in SQLite for downstream consumption.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, playwright, js-yaml, vitest

**Spec:** `docs/superpowers/specs/2026-06-11-resume-screening-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/index.ts` | All shared type definitions |
| `src/config/loader.ts` | Load and validate YAML screening config |
| `src/store/db.ts` | SQLite initialization and migration |
| `src/store/candidates.ts` | Candidate CRUD operations |
| `src/store/results.ts` | Screening result CRUD operations |
| `src/store/run-state.ts` | Run state key-value operations |
| `src/utils/anti-detect.ts` | Random delays, human-like interaction helpers |
| `src/utils/logger.ts` | Structured console logger with module prefixes |
| `src/scraper/browser-client.ts` | Playwright CDP browser client (connects to user's Chrome) |
| `src/scraper/boss-zhipin.ts` | Boss直聘 page navigation and data extraction |
| `src/scraper/index.ts` | Scraper orchestration (browser + extraction + anti-detect) |
| `src/screener/matcher.ts` | Individual rule matching operators |
| `src/screener/index.ts` | Screening engine (required + preferred + scoring) |
| `src/scheduler/index.ts` | Polling loop with configurable interval |
| `src/index.ts` | Entry point, wires all modules together |
| `config/screening.yaml` | Default screening rules configuration |
| `tests/` | Mirror of src/ structure for test files |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `config/screening.yaml`
- Modify: `README.md`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "recruitment-bot",
  "version": "0.1.0",
  "description": "招聘机器人 - Boss直聘简历筛选自动化服务",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "js-yaml": "^4.1.0",
    "playwright": "^1.45.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
data/
*.db
.env
```

- [ ] **Step 5: Create default config/screening.yaml**

```yaml
positions:
  - name: "中级运维工程师_北京 16-18k"
    boss_url: "https://www.zhipin.com/web/geek/chat"

    screening:
      required:
        - field: "status"
          not_in: ["在职-暂不考虑"]
        - field: "skills"
          contains_any: ["k8s", "kubernetes"]
        - field: "skills"
          contains_any: ["ci/cd", "jenkins", "gitlab ci", "github actions"]

      preferred:
        - field: "skills"
          contains_any: ["docker", "containerd"]
          weight: 10
        - field: "skills"
          contains_any: ["helm", "kustomize"]
          weight: 8
        - field: "skills"
          contains_any: ["prometheus", "grafana"]
          weight: 5
        - field: "experience_years"
          min: 3
          max: 7
          weight: 10
        - field: "salary_expectation"
          max: 18000
          weight: 5

      pass_threshold: 15
```

- [ ] **Step 6: Update README.md**

```markdown
# recruitment-bot

招聘机器人 - Boss直聘简历筛选自动化服务

## 快速开始

1. 启动 Chrome 并开启远程调试端口：
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
2. 在 Chrome 中登录 Boss直聘
3. 安装依赖并启动服务：
   ```bash
   npm install
   npm start
   ```

## 配置

编辑 `config/screening.yaml` 自定义筛选规则。

## 测试

```bash
npm test
```
```

- [ ] **Step 7: Install dependencies and verify**

Run: `npm install`
Expected: Dependencies installed, `node_modules/` and `package-lock.json` created.

- [ ] **Step 8: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: Chromium browser downloaded.

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (empty project).

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore config/screening.yaml README.md
git commit -m "chore: initialize project scaffolding"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/index.ts`
- Create: `tests/types/index.test.ts`

- [ ] **Step 1: Write failing tests for type validation helpers**

```ts
// tests/types/index.test.ts
import { describe, it, expect } from "vitest";
import {
  isValidScreeningStatus,
  isCandidate,
  type Candidate,
  type ScreeningStatus,
} from "../../src/types/index.js";

describe("isValidScreeningStatus", () => {
  it("accepts valid statuses", () => {
    expect(isValidScreeningStatus("passed")).toBe(true);
    expect(isValidScreeningStatus("rejected")).toBe(true);
    expect(isValidScreeningStatus("pending")).toBe(true);
  });

  it("rejects invalid statuses", () => {
    expect(isValidScreeningStatus("unknown")).toBe(false);
    expect(isValidScreeningStatus("")).toBe(false);
  });
});

describe("isCandidate", () => {
  it("validates a complete candidate object", () => {
    const c: Candidate = {
      id: "abc123",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s"], status: "离职-随时到岗" },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types/index.test.ts`
Expected: FAIL — cannot find module `../../src/types/index.js`

- [ ] **Step 3: Implement type definitions**

```ts
// src/types/index.ts

/** Candidate profile data extracted from Boss直聘 */
export interface Candidate {
  id: string;
  name: string;
  profileUrl: string;
  rawProfile: CandidateProfile;
  createdAt?: string;
  updatedAt?: string;
}

/** Structured profile data extracted from a candidate's detail page */
export interface CandidateProfile {
  status?: string;
  skills: string[];
  experienceYears?: number;
  salaryExpectation?: number;
  education?: string;
  workHistory: WorkEntry[];
  projectHistory: ProjectEntry[];
  selfEvaluation?: string;
}

export interface WorkEntry {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ProjectEntry {
  name: string;
  description?: string;
}

/** Status of a screening result */
export type ScreeningStatus = "passed" | "rejected" | "pending";

const VALID_STATUSES: ScreeningStatus[] = ["passed", "rejected", "pending"];

export function isValidScreeningStatus(s: string): s is ScreeningStatus {
  return VALID_STATUSES.includes(s as ScreeningStatus);
}

/** Screening result for a candidate on a specific position */
export interface ScreeningResult {
  id?: number;
  candidateId: string;
  positionName: string;
  status: ScreeningStatus;
  score: number;
  matchDetails: MatchDetails;
  screenedAt?: string;
}

/** Detailed breakdown of how rules matched */
export interface MatchDetails {
  requiredMatched: RuleMatch[];
  preferredMatched: PreferredMatch[];
  totalScore: number;
  threshold: number;
}

export interface RuleMatch {
  field: string;
  rule: string;
  matched?: string[];
  passed: boolean;
}

export interface PreferredMatch extends RuleMatch {
  weight: number;
}

/** Position configuration from YAML */
export interface PositionConfig {
  name: string;
  bossUrl: string;
  screening: ScreeningConfig;
}

export interface ScreeningConfig {
  required: RequiredRule[];
  preferred: PreferredRule[];
  passThreshold: number;
}

export interface RequiredRule {
  field: string;
  containsAny?: string[];
  containsAll?: string[];
  notIn?: string[];
  in?: string[];
  min?: number;
  max?: number;
}

export interface PreferredRule extends RequiredRule {
  weight: number;
}

/** Top-level YAML config structure */
export interface AppConfig {
  positions: PositionConfig[];
}

/** Runtime guard for Candidate objects */
export function isCandidate(obj: unknown): obj is Candidate {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.profileUrl === "string" &&
    o.rawProfile !== null &&
    typeof o.rawProfile === "object"
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/types/index.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts tests/types/index.test.ts
git commit -m "feat: add core type definitions with runtime guards"
```

---

### Task 3: Logger Utility

**Files:**
- Create: `src/utils/logger.ts`
- Create: `tests/utils/logger.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/utils/logger.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../src/utils/logger.js";

describe("createLogger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("prefixes messages with module name", () => {
    const logger = createLogger("scraper");
    logger.info("Connected to browser");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[scraper]"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Connected to browser"),
    );
  });

  it("supports warn and error levels", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger("store");

    logger.warn("slow query");
    logger.error("write failed");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[store]"));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[store]"));

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/logger.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement logger**

```ts
// src/utils/logger.ts

function timestamp(): string {
  return new Date().toISOString();
}

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export function createLogger(module: string): Logger {
  const prefix = `[${module}]`;
  return {
    info(msg: string, ...args: unknown[]) {
      console.log(`${timestamp()} ${prefix} ${msg}`, ...args);
    },
    warn(msg: string, ...args: unknown[]) {
      console.warn(`${timestamp()} ${prefix} ⚠ ${msg}`, ...args);
    },
    error(msg: string, ...args: unknown[]) {
      console.error(`${timestamp()} ${prefix} ✗ ${msg}`, ...args);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/logger.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/logger.ts tests/utils/logger.test.ts
git commit -m "feat: add structured logger with module prefixes"
```

---

### Task 4: Anti-Detection Utilities

**Files:**
- Create: `src/utils/anti-detect.ts`
- Create: `tests/utils/anti-detect.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/utils/anti-detect.test.ts
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
    const url = "https://www.zhipin.com/gongsi/job/abc123.html";
    expect(extractCandidateId(url)).toBe("abc123");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/anti-detect.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement anti-detection utilities**

```ts
// src/utils/anti-detect.ts

/**
 * Sleep for a random duration between minMs and maxMs.
 */
export function randomDelay(minMs: number = 2000, maxMs: number = 5000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Extract a unique candidate identifier from a Boss直聘 URL.
 * Tries geek_card query param first, then path segments, then falls back to URL hash.
 */
export function extractCandidateId(url: string): string {
  try {
    const parsed = new URL(url);

    // Try geek_card query parameter
    const geekCard = parsed.searchParams.get("geek_card");
    if (geekCard) return geekCard;

    // Try to extract ID-like segment from path
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    for (const part of pathParts) {
      // Match segments that look like IDs (alphanumeric, 8+ chars)
      const cleaned = part.replace(/\.(html|htm)$/, "");
      if (/^[a-zA-Z0-9_-]{6,}$/.test(cleaned) && !["web", "geek", "gongsi", "job", "card"].includes(cleaned)) {
        return cleaned;
      }
    }
  } catch {
    // Not a valid URL, fall through to hash
  }

  // Deterministic fallback: simple hash of the URL
  return simpleHash(url);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `fallback_${Math.abs(hash).toString(36)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/anti-detect.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/anti-detect.ts tests/utils/anti-detect.test.ts
git commit -m "feat: add anti-detection utilities (random delay, ID extraction)"
```

---

### Task 5: Config Loader

**Files:**
- Create: `src/config/loader.ts`
- Create: `tests/config/loader.test.ts`
- Create: `tests/config/fixtures/valid.yaml`
- Create: `tests/config/fixtures/invalid-missing-threshold.yaml`

- [ ] **Step 1: Write test fixtures**

```yaml
# tests/config/fixtures/valid.yaml
positions:
  - name: "Test Position"
    boss_url: "https://www.zhipin.com/web/geek/chat"
    screening:
      required:
        - field: "status"
          not_in: ["在职-暂不考虑"]
        - field: "skills"
          contains_any: ["k8s", "kubernetes"]
      preferred:
        - field: "skills"
          contains_any: ["docker"]
          weight: 10
      pass_threshold: 10
```

```yaml
# tests/config/fixtures/invalid-missing-threshold.yaml
positions:
  - name: "Bad Config"
    boss_url: "https://example.com"
    screening:
      required:
        - field: "status"
          not_in: ["test"]
      preferred: []
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/config/loader.test.ts
import { describe, it, expect } from "vitest";
import { loadConfig, validateConfig } from "../../src/config/loader.js";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("loadConfig", () => {
  it("loads and parses a valid YAML config", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    expect(config.positions).toHaveLength(1);
    expect(config.positions[0].name).toBe("Test Position");
    expect(config.positions[0].bossUrl).toBe("https://www.zhipin.com/web/geek/chat");
  });

  it("converts snake_case YAML keys to camelCase", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    const pos = config.positions[0];
    expect(pos.screening.passThreshold).toBe(10);
    expect(pos.screening.required[0].containsAny).toEqual(["k8s", "kubernetes"]);
  });

  it("converts snake_case contains_any to containsAny", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    const preferred = config.positions[0].screening.preferred[0];
    expect(preferred.containsAny).toEqual(["docker"]);
    expect(preferred.weight).toBe(10);
  });
});

describe("validateConfig", () => {
  it("accepts valid config", () => {
    const config = loadConfig(resolve(fixturesDir, "valid.yaml"));
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("rejects config with no positions", () => {
    expect(() => validateConfig({ positions: [] })).toThrow("at least one position");
  });

  it("rejects position without name", () => {
    expect(() =>
      validateConfig({
        positions: [
          { name: "", bossUrl: "https://x.com", screening: { required: [], preferred: [], passThreshold: 10 } },
        ],
      }),
    ).toThrow("name");
  });

  it("rejects position without bossUrl", () => {
    expect(() =>
      validateConfig({
        positions: [
          { name: "Test", bossUrl: "", screening: { required: [], preferred: [], passThreshold: 10 } },
        ],
      }),
    ).toThrow("bossUrl");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement config loader**

```ts
// src/config/loader.ts
import { readFileSync } from "fs";
import yaml from "js-yaml";
import type { AppConfig } from "../types/index.js";

/**
 * Recursively convert snake_case keys to camelCase.
 */
function camelCaseKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(camelCaseKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = camelCaseKeys(value);
    }
    return result;
  }
  return obj;
}

/**
 * Load and parse a YAML screening config file.
 * Converts snake_case YAML keys (pass_threshold, contains_any, etc.) to camelCase.
 */
export function loadConfig(filePath: string): AppConfig {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, unknown>;
  return camelCaseKeys(parsed) as AppConfig;
}

/**
 * Validate that a loaded config has all required fields.
 * Throws with descriptive error if validation fails.
 */
export function validateConfig(config: AppConfig): void {
  if (!config.positions || config.positions.length === 0) {
    throw new Error("Config must have at least one position");
  }

  for (const [i, pos] of config.positions.entries()) {
    if (!pos.name) {
      throw new Error(`Position[${i}]: name is required`);
    }
    if (!pos.bossUrl) {
      throw new Error(`Position[${i}]: bossUrl is required`);
    }
    if (!pos.screening) {
      throw new Error(`Position[${i}]: screening config is required`);
    }
    if (typeof pos.screening.passThreshold !== "number") {
      throw new Error(`Position[${i}]: passThreshold must be a number`);
    }
    if (!Array.isArray(pos.screening.required)) {
      throw new Error(`Position[${i}]: screening.required must be an array`);
    }
    if (!Array.isArray(pos.screening.preferred)) {
      throw new Error(`Position[${i}]: screening.preferred must be an array`);
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/loader.ts tests/config/
git commit -m "feat: add YAML config loader with snake_case to camelCase conversion"
```

---

### Task 6: SQLite Store — Database Initialization

**Files:**
- Create: `src/store/db.ts`
- Create: `tests/store/db.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/store/db.test.ts
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";

describe("initDatabase", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it("creates all three tables", () => {
    db = initDatabase(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("candidates");
    expect(names).toContain("screening_results");
    expect(names).toContain("run_state");
  });

  it("is idempotent (can be called twice)", () => {
    db = initDatabase(":memory:");
    expect(() => initDatabase(":memory:")).not.toThrow();
  });

  it("candidates table has correct columns", () => {
    db = initDatabase(":memory:");
    const info = db.prepare("PRAGMA table_info(candidates)").all() as { name: string; type: string }[];
    const cols = info.map((c) => c.name);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("profile_url");
    expect(cols).toContain("raw_profile");
    expect(cols).toContain("created_at");
    expect(cols).toContain("updated_at");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/db.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement database initialization**

```ts
// src/store/db.ts
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("store");

export function initDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      raw_profile JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS screening_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id TEXT NOT NULL REFERENCES candidates(id),
      position_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('passed', 'rejected', 'pending')),
      score INTEGER NOT NULL DEFAULT 0,
      match_details JSON NOT NULL,
      screened_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS run_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_screening_results_status
      ON screening_results(status);

    CREATE INDEX IF NOT EXISTS idx_screening_results_candidate
      ON screening_results(candidate_id);
  `);

  log.info(`Database initialized at ${dbPath}`);
  return db;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/store/db.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/db.ts tests/store/db.test.ts
git commit -m "feat: add SQLite database initialization with schema"
```

---

### Task 7: SQLite Store — Candidates CRUD

**Files:**
- Create: `src/store/candidates.ts`
- Create: `tests/store/candidates.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/store/candidates.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";

describe("CandidateStore", () => {
  let db: Database.Database;
  let store: CandidateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    store = new CandidateStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it("upserts a new candidate", () => {
    store.upsert({
      id: "abc123",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s"], status: "离职-随时到岗" },
    });
    const found = store.getById("abc123");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("张三");
  });

  it("updates existing candidate on upsert", () => {
    store.upsert({
      id: "abc123",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s"] },
    });
    store.upsert({
      id: "abc123",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: ["k8s", "docker"] },
    });
    const found = store.getById("abc123");
    const profile = JSON.parse(found!.rawProfile as string);
    expect(profile.skills).toEqual(["k8s", "docker"]);
  });

  it("returns null for non-existent candidate", () => {
    expect(store.getById("nonexistent")).toBeNull();
  });

  it("checks if candidate exists", () => {
    expect(store.exists("abc123")).toBe(false);
    store.upsert({
      id: "abc123",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/abc123",
      rawProfile: { skills: [] },
    });
    expect(store.exists("abc123")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/store/candidates.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement candidates store**

```ts
// src/store/candidates.ts
import type Database from "better-sqlite3";
import type { Candidate } from "../types/index.js";

interface CandidateRow {
  id: string;
  name: string;
  profile_url: string;
  raw_profile: string;
  created_at: string;
  updated_at: string;
}

export class CandidateStore {
  constructor(private db: Database.Database) {}

  upsert(candidate: Candidate): void {
    const stmt = this.db.prepare(`
      INSERT INTO candidates (id, name, profile_url, raw_profile, updated_at)
      VALUES (@id, @name, @profileUrl, @rawProfile, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        profile_url = excluded.profile_url,
        raw_profile = excluded.raw_profile,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run({
      id: candidate.id,
      name: candidate.name,
      profileUrl: candidate.profileUrl,
      rawProfile: JSON.stringify(candidate.rawProfile),
    });
  }

  getById(id: string): Candidate | null {
    const row = this.db
      .prepare("SELECT * FROM candidates WHERE id = ?")
      .get(id) as CandidateRow | undefined;
    if (!row) return null;
    return this.rowToCandidate(row);
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM candidates WHERE id = ?")
      .get(id);
    return row !== undefined;
  }

  private rowToCandidate(row: CandidateRow): Candidate {
    return {
      id: row.id,
      name: row.name,
      profileUrl: row.profile_url,
      rawProfile: JSON.parse(row.raw_profile),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/store/candidates.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/candidates.ts tests/store/candidates.test.ts
git commit -m "feat: add candidate store with upsert and lookup"
```

---

### Task 8: SQLite Store — Results CRUD and Run State

**Files:**
- Create: `src/store/results.ts`
- Create: `src/store/run-state.ts`
- Create: `tests/store/results.test.ts`
- Create: `tests/store/run-state.test.ts`

- [ ] **Step 1: Write failing tests for results store**

```ts
// tests/store/results.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { ResultStore } from "../../src/store/results.js";

describe("ResultStore", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let results: ResultStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    results = new ResultStore(db);

    // Seed a candidate for FK reference
    candidates.upsert({
      id: "c1",
      name: "张三",
      profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"] },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("inserts a screening result", () => {
    results.insert({
      candidateId: "c1",
      positionName: "Test",
      status: "passed",
      score: 25,
      matchDetails: {
        requiredMatched: [],
        preferredMatched: [],
        totalScore: 25,
        threshold: 15,
      },
    });
    const all = results.getByStatus("passed");
    expect(all).toHaveLength(1);
    expect(all[0].score).toBe(25);
  });

  it("gets results filtered by status", () => {
    results.insert({ candidateId: "c1", positionName: "Test", status: "passed", score: 25, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 25, threshold: 15 } });
    results.insert({ candidateId: "c1", positionName: "Test2", status: "rejected", score: 5, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 5, threshold: 15 } });
    expect(results.getByStatus("passed")).toHaveLength(1);
    expect(results.getByStatus("rejected")).toHaveLength(1);
  });

  it("updates status by candidate ID and position", () => {
    results.insert({ candidateId: "c1", positionName: "Test", status: "pending", score: 0, matchDetails: { requiredMatched: [], preferredMatched: [], totalScore: 0, threshold: 15 } });
    results.updateStatus("c1", "Test", "passed");
    const all = results.getByStatus("passed");
    expect(all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write failing tests for run state**

```ts
// tests/store/run-state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { RunStateStore } from "../../src/store/run-state.js";

describe("RunStateStore", () => {
  let db: Database.Database;
  let state: RunStateStore;

  beforeEach(() => {
    db = initDatabase(":memory:");
    state = new RunStateStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it("sets and gets a value", () => {
    state.set("last_scan_time", "2026-06-11T10:00:00Z");
    expect(state.get("last_scan_time")).toBe("2026-06-11T10:00:00Z");
  });

  it("returns null for missing key", () => {
    expect(state.get("nonexistent")).toBeNull();
  });

  it("overwrites existing value", () => {
    state.set("error_count", "0");
    state.set("error_count", "3");
    expect(state.get("error_count")).toBe("3");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/store/results.test.ts tests/store/run-state.test.ts`
Expected: FAIL — cannot find modules

- [ ] **Step 4: Implement results store**

```ts
// src/store/results.ts
import type Database from "better-sqlite3";
import type { ScreeningResult, ScreeningStatus } from "../types/index.js";

interface ResultRow {
  id: number;
  candidate_id: string;
  position_name: string;
  status: string;
  score: number;
  match_details: string;
  screened_at: string;
}

export class ResultStore {
  constructor(private db: Database.Database) {}

  insert(result: ScreeningResult): number {
    const stmt = this.db.prepare(`
      INSERT INTO screening_results (candidate_id, position_name, status, score, match_details)
      VALUES (@candidateId, @positionName, @status, @score, @matchDetails)
    `);
    const info = stmt.run({
      candidateId: result.candidateId,
      positionName: result.positionName,
      status: result.status,
      score: result.score,
      matchDetails: JSON.stringify(result.matchDetails),
    });
    return info.lastInsertRowid as number;
  }

  getByStatus(status: ScreeningStatus): ScreeningResult[] {
    const rows = this.db
      .prepare("SELECT * FROM screening_results WHERE status = ? ORDER BY screened_at DESC")
      .all(status) as ResultRow[];
    return rows.map(this.rowToResult);
  }

  updateStatus(candidateId: string, positionName: string, status: ScreeningStatus): void {
    this.db
      .prepare(`
        UPDATE screening_results
        SET status = ?, screened_at = CURRENT_TIMESTAMP
        WHERE candidate_id = ? AND position_name = ?
      `)
      .run(status, candidateId, positionName);
  }

  private rowToResult(row: ResultRow): ScreeningResult {
    return {
      id: row.id,
      candidateId: row.candidate_id,
      positionName: row.position_name,
      status: row.status as ScreeningStatus,
      score: row.score,
      matchDetails: JSON.parse(row.match_details),
      screenedAt: row.screened_at,
    };
  }
}
```

- [ ] **Step 5: Implement run state store**

```ts
// src/store/run-state.ts
import type Database from "better-sqlite3";

export class RunStateStore {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM run_state WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO run_state (key, value, updated_at)
        VALUES (@key, @value, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run({ key, value });
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/store/results.test.ts tests/store/run-state.test.ts`
Expected: 6 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/store/results.ts src/store/run-state.ts tests/store/results.test.ts tests/store/run-state.test.ts
git commit -m "feat: add screening results and run state stores"
```

---

### Task 9: Screening Rule Matcher

**Files:**
- Create: `src/screener/matcher.ts`
- Create: `tests/screener/matcher.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/screener/matcher.test.ts
import { describe, it, expect } from "vitest";
import { matchRule } from "../../src/screener/matcher.js";

describe("matchRule — contains_any", () => {
  it("matches when field contains any keyword (case insensitive)", () => {
    const result = matchRule(
      { skills: ["K8S经验", "Linux运维"] },
      { field: "skills", containsAny: ["k8s", "kubernetes"] },
    );
    expect(result.passed).toBe(true);
    expect(result.matched).toEqual(["k8s"]);
  });

  it("fails when field contains none of the keywords", () => {
    const result = matchRule(
      { skills: ["Java开发", "Spring Boot"] },
      { field: "skills", containsAny: ["k8s", "kubernetes"] },
    );
    expect(result.passed).toBe(false);
    expect(result.matched).toEqual([]);
  });
});

describe("matchRule — contains_all", () => {
  it("matches when field contains all keywords", () => {
    const result = matchRule(
      { skills: ["k8s", "jenkins", "docker"] },
      { field: "skills", containsAll: ["k8s", "jenkins"] },
    );
    expect(result.passed).toBe(true);
  });

  it("fails when field is missing one keyword", () => {
    const result = matchRule(
      { skills: ["k8s", "docker"] },
      { field: "skills", containsAll: ["k8s", "jenkins"] },
    );
    expect(result.passed).toBe(false);
  });
});

describe("matchRule — not_in", () => {
  it("passes when value is not in the list", () => {
    const result = matchRule(
      { status: "离职-随时到岗" },
      { field: "status", notIn: ["在职-暂不考虑"] },
    );
    expect(result.passed).toBe(true);
  });

  it("fails when value is in the list", () => {
    const result = matchRule(
      { status: "在职-暂不考虑" },
      { field: "status", notIn: ["在职-暂不考虑"] },
    );
    expect(result.passed).toBe(false);
  });
});

describe("matchRule — in", () => {
  it("passes when value is in the list", () => {
    const result = matchRule(
      { education: "本科" },
      { field: "education", in: ["本科", "硕士", "博士"] },
    );
    expect(result.passed).toBe(true);
  });

  it("fails when value is not in the list", () => {
    const result = matchRule(
      { education: "大专" },
      { field: "education", in: ["本科", "硕士", "博士"] },
    );
    expect(result.passed).toBe(false);
  });
});

describe("matchRule — min/max (numeric range)", () => {
  it("passes when value is within range", () => {
    const result = matchRule(
      { experienceYears: 5 },
      { field: "experienceYears", min: 3, max: 7 },
    );
    expect(result.passed).toBe(true);
  });

  it("fails when value is below min", () => {
    const result = matchRule(
      { experienceYears: 2 },
      { field: "experienceYears", min: 3, max: 7 },
    );
    expect(result.passed).toBe(false);
  });

  it("fails when value is above max", () => {
    const result = matchRule(
      { experienceYears: 10 },
      { field: "experienceYears", min: 3, max: 7 },
    );
    expect(result.passed).toBe(false);
  });

  it("passes with only min specified", () => {
    const result = matchRule(
      { experienceYears: 5 },
      { field: "experienceYears", min: 3 },
    );
    expect(result.passed).toBe(true);
  });

  it("passes with only max specified", () => {
    const result = matchRule(
      { salaryExpectation: 15000 },
      { field: "salaryExpectation", max: 18000 },
    );
    expect(result.passed).toBe(true);
  });
});

describe("matchRule — missing field", () => {
  it("fails contains_any when field is missing", () => {
    const result = matchRule(
      {},
      { field: "skills", containsAny: ["k8s"] },
    );
    expect(result.passed).toBe(false);
  });

  it("fails not_in when field is missing", () => {
    const result = matchRule(
      {},
      { field: "status", notIn: ["在职-暂不考虑"] },
    );
    expect(result.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/screener/matcher.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement rule matcher**

```ts
// src/screener/matcher.ts
import type { RequiredRule, RuleMatch } from "../types/index.js";

interface ProfileData {
  [key: string]: unknown;
}

/**
 * Check if a haystack string contains a needle (case-insensitive substring match).
 */
function containsInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Get the field value from profile data.
 * For array fields (skills, workHistory), returns the array.
 * For scalar fields, returns the value directly.
 */
function getFieldValue(profile: ProfileData, field: string): unknown {
  return profile[field];
}

/**
 * Match a single rule against a candidate's profile data.
 * Returns whether the rule passed and which keywords matched.
 */
export function matchRule(profile: ProfileData, rule: RequiredRule): RuleMatch {
  const field = rule.field;
  const value = getFieldValue(profile, field);

  // contains_any: at least one keyword must be found in the field
  if (rule.containsAny) {
    const matched: string[] = [];
    const searchIn = Array.isArray(value)
      ? value.map(String).join(" ")
      : String(value ?? "");

    for (const keyword of rule.containsAny) {
      if (containsInsensitive(searchIn, keyword)) {
        matched.push(keyword);
      }
    }
    return { field, rule: "contains_any", matched, passed: matched.length > 0 };
  }

  // contains_all: every keyword must be found
  if (rule.containsAll) {
    const searchIn = Array.isArray(value)
      ? value.map(String).join(" ")
      : String(value ?? "");

    const matched: string[] = [];
    for (const keyword of rule.containsAll) {
      if (containsInsensitive(searchIn, keyword)) {
        matched.push(keyword);
      }
    }
    return { field, rule: "contains_all", matched, passed: matched.length === rule.containsAll.length };
  }

  // not_in: value must NOT be in the list
  if (rule.notIn) {
    if (value === undefined || value === null) {
      return { field, rule: "not_in", passed: false };
    }
    const strValue = String(value).toLowerCase();
    const inList = rule.notIn.some((item) => strValue === item.toLowerCase());
    return { field, rule: "not_in", passed: !inList };
  }

  // in: value must be in the list
  if (rule.in) {
    if (value === undefined || value === null) {
      return { field, rule: "in", passed: false };
    }
    const strValue = String(value).toLowerCase();
    const inList = rule.in.some((item) => strValue === item.toLowerCase());
    return { field, rule: "in", matched: inList ? [String(value)] : [], passed: inList };
  }

  // min/max: numeric range check
  if (rule.min !== undefined || rule.max !== undefined) {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return { field, rule: "range", passed: false };
    }
    const aboveMin = rule.min === undefined || numValue >= rule.min;
    const belowMax = rule.max === undefined || numValue <= rule.max;
    return { field, rule: "range", passed: aboveMin && belowMax };
  }

  // Unknown rule type — fail safe
  return { field, rule: "unknown", passed: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/screener/matcher.test.ts`
Expected: 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/screener/matcher.ts tests/screener/matcher.test.ts
git commit -m "feat: add screening rule matcher with all operators"
```

---

### Task 10: Screening Engine

**Files:**
- Create: `src/screener/index.ts`
- Create: `tests/screener/index.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/screener/index.test.ts
import { describe, it, expect } from "vitest";
import { Screener } from "../../src/screener/index.js";
import type { ScreeningConfig, CandidateProfile } from "../../src/types/index.js";

const config: ScreeningConfig = {
  required: [
    { field: "status", notIn: ["在职-暂不考虑"] },
    { field: "skills", containsAny: ["k8s", "kubernetes"] },
    { field: "skills", containsAny: ["ci/cd", "jenkins", "gitlab ci"] },
  ],
  preferred: [
    { field: "skills", containsAny: ["docker"], weight: 10 },
    { field: "skills", containsAny: ["helm"], weight: 8 },
    { field: "experienceYears", min: 3, max: 7, weight: 10 },
    { field: "salaryExpectation", max: 18000, weight: 5 },
  ],
  passThreshold: 15,
};

describe("Screener", () => {
  const screener = new Screener(config);

  it("rejects candidate failing a required rule", () => {
    const profile: CandidateProfile = {
      status: "在职-暂不考虑",
      skills: ["k8s", "jenkins"],
      workHistory: [],
      projectHistory: [],
    };
    const result = screener.screen("c1", "Test", profile);
    expect(result.status).toBe("rejected");
    expect(result.score).toBe(0);
  });

  it("rejects candidate missing required skills", () => {
    const profile: CandidateProfile = {
      status: "离职-随时到岗",
      skills: ["Java", "Spring"],
      workHistory: [],
      projectHistory: [],
    };
    const result = screener.screen("c1", "Test", profile);
    expect(result.status).toBe("rejected");
  });

  it("passes candidate meeting all required + enough preferred", () => {
    const profile: CandidateProfile = {
      status: "离职-随时到岗",
      skills: ["k8s", "jenkins", "docker", "helm"],
      experienceYears: 5,
      salaryExpectation: 17000,
      workHistory: [],
      projectHistory: [],
    };
    const result = screener.screen("c1", "Test", profile);
    expect(result.status).toBe("passed");
    expect(result.score).toBeGreaterThan(0);
    // docker(10) + helm(8) + experience(10) + salary(5) = 33
    expect(result.score).toBe(33);
  });

  it("rejects candidate meeting required but below threshold", () => {
    const profile: CandidateProfile = {
      status: "离职-随时到岗",
      skills: ["k8s", "jenkins"],
      workHistory: [],
      projectHistory: [],
    };
    const result = screener.screen("c1", "Test", profile);
    expect(result.status).toBe("rejected");
    expect(result.score).toBeLessThan(15);
  });

  it("records match details for passed candidate", () => {
    const profile: CandidateProfile = {
      status: "离职-随时到岗",
      skills: ["k8s", "jenkins", "docker"],
      experienceYears: 5,
      workHistory: [],
      projectHistory: [],
    };
    const result = screener.screen("c1", "Test", profile);
    expect(result.matchDetails.requiredMatched).toHaveLength(3);
    expect(result.matchDetails.requiredMatched.every((r) => r.passed)).toBe(true);
    expect(result.matchDetails.totalScore).toBe(result.score);
    expect(result.matchDetails.threshold).toBe(15);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/screener/index.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement screening engine**

```ts
// src/screener/index.ts
import { matchRule } from "./matcher.js";
import type {
  ScreeningConfig,
  ScreeningResult,
  ScreeningStatus,
  CandidateProfile,
  MatchDetails,
  RuleMatch,
  PreferredMatch,
} from "../types/index.js";

export class Screener {
  constructor(private config: ScreeningConfig) {}

  /**
   * Screen a candidate's profile against the configured rules.
   * Returns a ScreeningResult with status, score, and match details.
   */
  screen(candidateId: string, positionName: string, profile: CandidateProfile): ScreeningResult {
    const profileData = profile as unknown as Record<string, unknown>;

    // Phase 1: Check required rules
    const requiredMatched: RuleMatch[] = this.config.required.map((rule) =>
      matchRule(profileData, rule),
    );

    const allRequiredPassed = requiredMatched.every((r) => r.passed);

    if (!allRequiredPassed) {
      return {
        candidateId,
        positionName,
        status: "rejected" as ScreeningStatus,
        score: 0,
        matchDetails: {
          requiredMatched,
          preferredMatched: [],
          totalScore: 0,
          threshold: this.config.passThreshold,
        },
      };
    }

    // Phase 2: Score preferred rules
    const preferredMatched: PreferredMatch[] = this.config.preferred.map((rule) => {
      const result = matchRule(profileData, rule);
      return { ...result, weight: rule.weight };
    });

    const totalScore = preferredMatched
      .filter((r) => r.passed)
      .reduce((sum, r) => sum + r.weight, 0);

    const status: ScreeningStatus = totalScore >= this.config.passThreshold ? "passed" : "rejected";

    const matchDetails: MatchDetails = {
      requiredMatched,
      preferredMatched,
      totalScore,
      threshold: this.config.passThreshold,
    };

    return { candidateId, positionName, status, score: totalScore, matchDetails };
  }

  /**
   * Reload config (e.g. after screening.yaml is updated).
   */
  reload(newConfig: ScreeningConfig): void {
    this.config = newConfig;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/screener/index.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/screener/index.ts tests/screener/index.test.ts
git commit -m "feat: add screening engine with required/preferred scoring"
```

---

### Task 11: Browser Client (Playwright CDP)

**Files:**
- Create: `src/scraper/browser-client.ts`
- Create: `tests/scraper/browser-client.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/scraper/browser-client.test.ts
import { describe, it, expect } from "vitest";
import { BrowserClient } from "../../src/scraper/browser-client.js";

describe("BrowserClient", () => {
  it("is constructable with a CDP endpoint", () => {
    const client = new BrowserClient("http://127.0.0.1:9222");
    expect(client).toBeDefined();
    expect(client.endpoint).toBe("http://127.0.0.1:9222");
  });

  it("defaults to localhost:9222", () => {
    const client = new BrowserClient();
    expect(client.endpoint).toBe("http://127.0.0.1:9222");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scraper/browser-client.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement browser client**

```ts
// src/scraper/browser-client.ts
import { chromium, type Browser, type Page } from "playwright";
import { createLogger } from "../utils/logger.js";

const log = createLogger("browser");

/**
 * Browser client that connects to an existing Chrome instance via CDP.
 * The user must start Chrome with --remote-debugging-port=9222.
 *
 * For kimi-webbridge integration: replace connectOverCDP with the
 * kimi-webbridge daemon's WebSocket endpoint.
 */
export class BrowserClient {
  readonly endpoint: string;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(endpoint: string = "http://127.0.0.1:9222") {
    this.endpoint = endpoint;
  }

  async connect(): Promise<void> {
    log.info(`Connecting to Chrome at ${this.endpoint}...`);
    this.browser = await chromium.connectOverCDP(this.endpoint);
    const contexts = this.browser.contexts();
    if (contexts.length > 0) {
      this.page = contexts[0].pages()[0] ?? (await contexts[0].newPage());
    } else {
      const context = await this.browser.newContext();
      this.page = await context.newPage();
    }
    log.info("Connected to browser");
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      // Don't close the browser — just disconnect
      this.browser = null;
      this.page = null;
      log.info("Disconnected from browser");
    }
  }

  async navigate(url: string): Promise<void> {
    this.ensurePage();
    await this.page!.goto(url, { waitUntil: "domcontentloaded" });
  }

  async getTextContent(selector: string): Promise<string> {
    this.ensurePage();
    const el = await this.page!.waitForSelector(selector, { timeout: 10000 });
    return (await el?.textContent()) ?? "";
  }

  async getAllTextContents(selector: string): Promise<string[]> {
    this.ensurePage();
    return this.page!.$$eval(selector, (els) => els.map((el) => el.textContent ?? ""));
  }

  async click(selector: string): Promise<void> {
    this.ensurePage();
    await this.page!.click(selector);
  }

  async waitForSelector(selector: string, timeout: number = 10000): Promise<void> {
    this.ensurePage();
    await this.page!.waitForSelector(selector, { timeout });
  }

  async screenshot(path: string): Promise<void> {
    this.ensurePage();
    await this.page!.screenshot({ path });
  }

  async evaluate<T>(fn: () => T): Promise<T> {
    this.ensurePage();
    return this.page!.evaluate(fn);
  }

  getPage(): Page {
    this.ensurePage();
    return this.page!;
  }

  private ensurePage(): void {
    if (!this.page) {
      throw new Error("Browser not connected. Call connect() first.");
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scraper/browser-client.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scraper/browser-client.ts tests/scraper/browser-client.test.ts
git commit -m "feat: add Playwright CDP browser client"
```

---

### Task 12: Boss直聘 Page Scraper

**Files:**
- Create: `src/scraper/boss-zhipin.ts`
- Create: `tests/scraper/boss-zhipin.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/scraper/boss-zhipin.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseCandidateList, parseCandidateDetail } from "../../src/scraper/boss-zhipin.js";

describe("parseCandidateList", () => {
  it("parses candidate entries from mock page data", () => {
    const mockPageData = [
      {
        name: "张三",
        status: "离职-随时到岗",
        skills: "K8S, Docker, Jenkins",
        experienceYears: "5年",
        salaryExpectation: "16-18K",
        profileUrl: "https://www.zhipin.com/web/geek/card?geek_card=abc123",
      },
      {
        name: "李四",
        status: "在职-考虑机会",
        skills: "Linux, Nginx",
        experienceYears: "3年",
        salaryExpectation: "15-17K",
        profileUrl: "https://www.zhipin.com/web/geek/card?geek_card=def456",
      },
    ];

    const candidates = parseCandidateList(mockPageData);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].name).toBe("张三");
    expect(candidates[0].id).toBe("abc123");
    expect(candidates[1].name).toBe("李四");
    expect(candidates[1].id).toBe("def456");
  });

  it("handles empty list", () => {
    expect(parseCandidateList([])).toEqual([]);
  });

  it("parses salary range to midpoint number", () => {
    const data = [{
      name: "王五",
      status: "离职",
      skills: "k8s",
      experienceYears: "3年",
      salaryExpectation: "16-18K",
      profileUrl: "https://www.zhipin.com/web/geek/card?geek_card=x1",
    }];
    const result = parseCandidateList(data);
    // (16000 + 18000) / 2 = 17000
    expect(result[0].rawProfile.salaryExpectation).toBe(17000);
  });

  it("parses experience years string to number", () => {
    const data = [{
      name: "赵六",
      status: "离职",
      skills: "docker",
      experienceYears: "5年",
      salaryExpectation: "15K",
      profileUrl: "https://www.zhipin.com/web/geek/card?geek_card=x2",
    }];
    const result = parseCandidateList(data);
    expect(result[0].rawProfile.experienceYears).toBe(5);
  });
});

describe("parseCandidateDetail", () => {
  it("parses detailed profile from mock page data", () => {
    const mockDetail = {
      skills: ["K8S", "Docker", "Jenkins", "CI/CD", "Prometheus"],
      workHistory: [
        { company: "ABC公司", title: "运维工程师", startDate: "2020-01", endDate: "2024-06", description: "负责K8S集群" },
      ],
      projectHistory: [
        { name: "容器化迁移", description: "将服务迁移到K8S" },
      ],
      selfEvaluation: "5年运维经验，熟悉云原生",
    };

    const profile = parseCandidateDetail(mockDetail);
    expect(profile.skills).toEqual(["K8S", "Docker", "Jenkins", "CI/CD", "Prometheus"]);
    expect(profile.workHistory).toHaveLength(1);
    expect(profile.projectHistory).toHaveLength(1);
    expect(profile.selfEvaluation).toBe("5年运维经验，熟悉云原生");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scraper/boss-zhipin.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement Boss直聘 page parser**

```ts
// src/scraper/boss-zhipin.ts
import type { Candidate, CandidateProfile, WorkEntry, ProjectEntry } from "../types/index.js";
import { extractCandidateId } from "../utils/anti-detect.js";

/** Raw candidate list item as extracted from the Boss直聘 page via browser evaluate() */
export interface RawCandidateListItem {
  name: string;
  status: string;
  skills: string;
  experienceYears: string;
  salaryExpectation: string;
  profileUrl: string;
}

/** Raw candidate detail as extracted from the detail page via browser evaluate() */
export interface RawCandidateDetail {
  skills: string[];
  workHistory: WorkEntry[];
  projectHistory: ProjectEntry[];
  selfEvaluation?: string;
  status?: string;
  experienceYears?: string;
  salaryExpectation?: string;
}

/**
 * Parse a list of raw candidate items from the Boss直聘 chat list page
 * into Candidate objects with structured profile data.
 */
export function parseCandidateList(items: RawCandidateListItem[]): Candidate[] {
  return items.map((item) => ({
    id: extractCandidateId(item.profileUrl),
    name: item.name,
    profileUrl: item.profileUrl,
    rawProfile: {
      status: item.status,
      skills: parseSkillsString(item.skills),
      experienceYears: parseYearsString(item.experienceYears),
      salaryExpectation: parseSalaryString(item.salaryExpectation),
      workHistory: [],
      projectHistory: [],
    },
  }));
}

/**
 * Parse detailed profile data from a candidate's detail page.
 * Merges with the summary data already extracted from the list.
 */
export function parseCandidateDetail(detail: RawCandidateDetail): CandidateProfile {
  return {
    skills: detail.skills,
    status: detail.status,
    experienceYears: detail.experienceYears
      ? parseYearsString(detail.experienceYears)
      : undefined,
    salaryExpectation: detail.salaryExpectation
      ? parseSalaryString(detail.salaryExpectation)
      : undefined,
    workHistory: detail.workHistory,
    projectHistory: detail.projectHistory,
    selfEvaluation: detail.selfEvaluation,
  };
}

/** Parse comma-separated skills string into array */
function parseSkillsString(skills: string): string[] {
  if (!skills) return [];
  return skills
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse "5年" → 5, "3-5年" → 4 (midpoint), "应届" → 0 */
function parseYearsString(years: string): number | undefined {
  if (!years) return undefined;
  if (years.includes("应届")) return 0;

  const rangeMatch = years.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (rangeMatch) {
    return Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2);
  }

  const singleMatch = years.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1]);
  }

  return undefined;
}

/** Parse "16-18K" → 17000, "15K" → 15000 */
function parseSalaryString(salary: string): number | undefined {
  if (!salary) return undefined;

  // Remove non-numeric except dash and K/k
  const cleaned = salary.replace(/[^\d\-Kk]/g, "");

  const rangeMatch = cleaned.match(/(\d+)\s*[-~]\s*(\d+)/i);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1]) * 1000;
    const high = parseInt(rangeMatch[2]) * 1000;
    return Math.round((low + high) / 2);
  }

  const singleMatch = cleaned.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1]) * 1000;
  }

  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scraper/boss-zhipin.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scraper/boss-zhipin.ts tests/scraper/boss-zhipin.test.ts
git commit -m "feat: add Boss直聘 page parser with salary/experience extraction"
```

---

### Task 13: Scraper Orchestration

**Files:**
- Create: `src/scraper/index.ts`
- Create: `tests/scraper/index.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/scraper/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { Scraper } from "../../src/scraper/index.js";
import type { CandidateStore } from "../../src/store/candidates.js";

describe("Scraper", () => {
  it("is constructable with config", () => {
    const mockStore = {} as CandidateStore;
    const scraper = new Scraper(mockStore, { maxPerRound: 20, minDelay: 100, maxDelay: 200 });
    expect(scraper).toBeDefined();
  });

  it("filters out already-processed candidates", () => {
    const processed = new Set(["c1", "c2"]);
    const mockStore = {
      exists: (id: string) => processed.has(id),
      upsert: vi.fn(),
    } as unknown as CandidateStore;

    const scraper = new Scraper(mockStore, { maxPerRound: 20, minDelay: 100, maxDelay: 200 });
    const newIds = scraper.filterNew(
      ["c1", "c2", "c3", "c4"],
      (id) => mockStore.exists(id),
    );
    expect(newIds).toEqual(["c3", "c4"]);
  });

  it("respects maxPerRound limit", () => {
    const mockStore = {
      exists: () => false,
      upsert: vi.fn(),
    } as unknown as CandidateStore;

    const scraper = new Scraper(mockStore, { maxPerRound: 2, minDelay: 100, maxDelay: 200 });
    const limited = scraper.filterNew(
      ["c1", "c2", "c3", "c4"],
      (id) => mockStore.exists(id),
    );
    expect(limited).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scraper/index.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement scraper orchestration**

```ts
// src/scraper/index.ts
import type { BrowserClient } from "./browser-client.js";
import { parseCandidateList, parseCandidateDetail, type RawCandidateListItem, type RawCandidateDetail } from "./boss-zhipin.js";
import type { CandidateStore } from "../store/candidates.js";
import { randomDelay } from "../utils/anti-detect.js";
import { createLogger } from "../utils/logger.js";
import type { Candidate } from "../types/index.js";

const log = createLogger("scraper");

export interface ScraperOptions {
  maxPerRound: number;
  minDelay: number;
  maxDelay: number;
}

const DEFAULT_OPTIONS: ScraperOptions = {
  maxPerRound: 20,
  minDelay: 2000,
  maxDelay: 5000,
};

export class Scraper {
  private options: ScraperOptions;

  constructor(
    private candidateStore: CandidateStore,
    options?: Partial<ScraperOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Filter a list of candidate IDs to only those not yet processed.
   * Respects maxPerRound limit.
   */
  filterNew(candidateIds: string[], existsFn: (id: string) => boolean): string[] {
    const newIds: string[] = [];
    for (const id of candidateIds) {
      if (newIds.length >= this.options.maxPerRound) break;
      if (!existsFn(id)) {
        newIds.push(id);
      }
    }
    return newIds;
  }

  /**
   * Run a full scraping round for a given position URL.
   * Returns all newly scraped candidates.
   */
  async scrapeRound(browser: BrowserClient, bossUrl: string): Promise<Candidate[]> {
    log.info(`Starting scrape round for ${bossUrl}`);

    await browser.navigate(bossUrl);
    await randomDelay(this.options.minDelay, this.options.maxDelay);

    // Extract candidate list from the page
    const rawList = await browser.evaluate<RawCandidateListItem[]>(() => {
      // This runs in the browser context
      // Selectors target Boss直聘 chat list page structure
      const items = document.querySelectorAll(".chat-item, .candidate-item, [class*='chat']");
      return Array.from(items).map((item) => ({
        name: item.querySelector(".name, .geek-name")?.textContent?.trim() ?? "",
        status: item.querySelector(".status, .job-status")?.textContent?.trim() ?? "",
        skills: item.querySelector(".skills, .tag-list")?.textContent?.trim() ?? "",
        experienceYears: item.querySelector(".exp, .work-year")?.textContent?.trim() ?? "",
        salaryExpectation: item.querySelector(".salary, .expect-salary")?.textContent?.trim() ?? "",
        profileUrl: item.querySelector("a")?.href ?? "",
      }));
    });

    const candidates = parseCandidateList(rawList);
    log.info(`Found ${candidates.length} candidates on page`);

    // Filter to new candidates only
    const newIds = this.filterNew(
      candidates.map((c) => c.id),
      (id) => this.candidateStore.exists(id),
    );
    log.info(`${newIds.length} new candidates to process (skipped ${candidates.length - newIds.length} already-processed)`);

    const newCandidates = candidates.filter((c) => newIds.includes(c.id));
    const results: Candidate[] = [];

    for (const candidate of newCandidates) {
      try {
        // Navigate to candidate detail
        await browser.navigate(candidate.profileUrl);
        await randomDelay(this.options.minDelay, this.options.maxDelay);

        // Extract detailed profile
        const rawDetail = await browser.evaluate<RawCandidateDetail>(() => {
          const skills = Array.from(
            document.querySelectorAll(".skill-tag, .tag-item, [class*='skill']"),
          ).map((el) => el.textContent?.trim() ?? "");

          const workItems = document.querySelectorAll(".work-item, [class*='work-exp']");
          const workHistory = Array.from(workItems).map((item) => ({
            company: item.querySelector(".company")?.textContent?.trim() ?? "",
            title: item.querySelector(".title, .position")?.textContent?.trim() ?? "",
            startDate: item.querySelector(".date, .time")?.textContent?.trim() ?? "",
            endDate: "",
            description: item.querySelector(".desc, .content")?.textContent?.trim() ?? "",
          }));

          const projectItems = document.querySelectorAll(".project-item, [class*='project']");
          const projectHistory = Array.from(projectItems).map((item) => ({
            name: item.querySelector(".name, .title")?.textContent?.trim() ?? "",
            description: item.querySelector(".desc, .content")?.textContent?.trim() ?? "",
          }));

          return {
            skills,
            workHistory,
            projectHistory,
            selfEvaluation: document.querySelector(".self-eval, [class*='evaluate']")?.textContent?.trim() ?? "",
          };
        });

        const detail = parseCandidateDetail(rawDetail);
        const enriched: Candidate = {
          ...candidate,
          rawProfile: { ...candidate.rawProfile, ...detail },
        };

        // Store candidate
        this.candidateStore.upsert(enriched);
        results.push(enriched);
        log.info(`Scraped: ${enriched.name} (${enriched.id})`);

        // Navigate back to list
        await browser.navigate(bossUrl);
        await randomDelay(this.options.minDelay, this.options.maxDelay);
      } catch (err) {
        log.error(`Failed to scrape candidate ${candidate.id}: ${err}`);
      }
    }

    log.info(`Scrape round complete. Processed ${results.length} new candidates.`);
    return results;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scraper/index.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scraper/index.ts tests/scraper/index.test.ts
git commit -m "feat: add scraper orchestration with filtering and round management"
```

---

### Task 14: Scheduler

**Files:**
- Create: `src/scheduler/index.ts`
- Create: `tests/scheduler/index.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/scheduler/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "../../src/scheduler/index.js";

describe("Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes callback immediately on start", async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(callback, { intervalMs: 60000, maxBackoffMs: 1800000 });

    const startPromise = scheduler.start();
    // The first invocation should happen immediately
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.stop();
    await startPromise;
  });

  it("executes callback on interval", async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(callback, { intervalMs: 1000, maxBackoffMs: 30000 });

    const startPromise = scheduler.start();
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    // Allow microtasks to flush
    await vi.runAllTimersAsync();
    expect(callback).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await startPromise;
  });

  it("stops executing after stop() is called", async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(callback, { intervalMs: 1000, maxBackoffMs: 30000 });

    const startPromise = scheduler.start();
    scheduler.stop();
    await startPromise;

    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    // Should only have the initial call
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not start a new round while previous is still running", async () => {
    let resolveFirst: () => void;
    const firstRun = new Promise<void>((r) => { resolveFirst = r; });
    const callback = vi.fn()
      .mockImplementationOnce(() => firstRun)
      .mockResolvedValue(undefined);

    const scheduler = new Scheduler(callback, { intervalMs: 1000, maxBackoffMs: 30000 });
    const startPromise = scheduler.start();

    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();
    // Should still be 1 because first call hasn't resolved
    expect(callback).toHaveBeenCalledTimes(1);

    resolveFirst!();
    scheduler.stop();
    await startPromise;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scheduler/index.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement scheduler**

```ts
// src/scheduler/index.ts
import { createLogger } from "../utils/logger.js";

const log = createLogger("scheduler");

export interface SchedulerOptions {
  intervalMs: number;
  maxBackoffMs: number;
}

export class Scheduler {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isExecuting = false;
  private currentInterval: number;

  constructor(
    private callback: () => Promise<void>,
    private options: SchedulerOptions,
  ) {}

  /**
   * Trigger exponential backoff (e.g., on rate-limit detection).
   * Doubles the interval up to maxBackoffMs, resets on next success.
   */
  backoff(): void {
    this.currentInterval = Math.min(
      this.currentInterval * 2,
      this.options.maxBackoffMs,
    );
    log.warn(`Backing off to ${this.currentInterval / 1000}s`);
  }

  resetBackoff(): void {
    this.currentInterval = this.options.intervalMs;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.currentInterval = this.options.intervalMs;
    log.info(`Scheduler started (interval: ${this.options.intervalMs}ms)`);

    // Execute immediately
    await this.executeRound();

    // Then schedule subsequent rounds
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info("Scheduler stopped");
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      await this.executeRound();
      this.scheduleNext();
    }, this.currentInterval);
  }

  private async executeRound(): Promise<void> {
    if (this.isExecuting) {
      log.warn("Previous round still running, skipping");
      return;
    }
    this.isExecuting = true;
    try {
      await this.callback();
      this.resetBackoff();
    } catch (err) {
      log.error(`Round failed: ${err}`);
      this.backoff();
    } finally {
      this.isExecuting = false;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scheduler/index.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scheduler/index.ts tests/scheduler/index.test.ts
git commit -m "feat: add scheduler with configurable interval and overlap prevention"
```

---

### Task 15: Main Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement main entry point**

```ts
// src/index.ts
import { resolve } from "path";
import { loadConfig, validateConfig } from "./config/loader.js";
import { initDatabase } from "./store/db.js";
import { CandidateStore } from "./store/candidates.js";
import { ResultStore } from "./store/results.js";
import { RunStateStore } from "./store/run-state.js";
import { BrowserClient } from "./scraper/browser-client.js";
import { Scraper } from "./scraper/index.js";
import { Screener } from "./screener/index.js";
import { Scheduler } from "./scheduler/index.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("recruitment-bot");

const CONFIG_PATH = resolve(import.meta.dirname, "..", "config", "screening.yaml");
const DB_PATH = resolve(import.meta.dirname, "..", "data", "recruitment.db");
const CDP_ENDPOINT = process.env.CHROME_CDP_ENDPOINT ?? "http://127.0.0.1:9222";
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS ?? "300000", 10); // 5 minutes

async function main(): Promise<void> {
  log.info("Starting recruitment-bot service...");

  // Load config
  const config = loadConfig(CONFIG_PATH);
  validateConfig(config);
  log.info(`Loaded ${config.positions.length} position(s) from config`);

  // Init database
  const db = initDatabase(DB_PATH);
  const candidateStore = new CandidateStore(db);
  const resultStore = new ResultStore(db);
  const runState = new RunStateStore(db);

  // Init browser
  const browser = new BrowserClient(CDP_ENDPOINT);

  // Init screener for first position (extend to support multiple positions later)
  const position = config.positions[0];
  const screener = new Screener(position.screening);

  // Define the scanning round
  const scraper = new Scraper(candidateStore);

  async function scanRound(): Promise<void> {
    // Check if paused
    if (runState.get("is_paused") === "true") {
      log.warn("⚠ Service is paused (login expired?). Re-login and set is_paused=false to resume.");
      return;
    }

    try {
      await browser.connect();
    } catch (err) {
      log.error(`⚠ Failed to connect to browser: ${err}`);
      log.error("Make sure Chrome is running with --remote-debugging-port=9222");
      return;
    }

    try {
      const candidates = await scraper.scrapeRound(browser, position.bossUrl);

      // Screen each candidate
      let passed = 0;
      let rejected = 0;
      for (const candidate of candidates) {
        const result = screener.screen(candidate.id, position.name, candidate.rawProfile);
        resultStore.insert(result);

        if (result.status === "passed") {
          passed++;
          log.info(`✓ PASSED: ${candidate.name} (score: ${result.score})`);
        } else {
          rejected++;
        }
      }

      log.info(`Round summary: ${passed} passed, ${rejected} rejected, ${candidates.length} total`);
      runState.set("last_scan_time", new Date().toISOString());
      runState.set("error_count", "0");
    } catch (err) {
      log.error(`Scan round failed: ${err}`);
      const errorCount = parseInt(runState.get("error_count") ?? "0", 10) + 1;
      runState.set("error_count", String(errorCount));
    } finally {
      await browser.disconnect();
    }
  }

  // Start scheduler
  const scheduler = new Scheduler(scanRound, { intervalMs: SCAN_INTERVAL_MS, maxBackoffMs: 1800000 });

  log.info(`Service started, scanning every ${SCAN_INTERVAL_MS / 1000}s...`);
  log.info(`Chrome CDP endpoint: ${CDP_ENDPOINT}`);
  log.info(`Position: ${position.name}`);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down...");
    scheduler.stop();
    db.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down...");
    scheduler.stop();
    db.close();
    process.exit(0);
  });

  await scheduler.start();
}

main().catch((err) => {
  log.error(`Fatal error: ${err}`);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add main entry point wiring all modules together"
```

---

### Task 16: End-to-End Verification

- [ ] **Step 1: Start Chrome with remote debugging**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

- [ ] **Step 2: Login to Boss直聘 in Chrome**

Navigate to https://www.zhipin.com and login.

- [ ] **Step 3: Update config/screening.yaml with actual position URL**

Edit `config/screening.yaml` and set `boss_url` to the actual Boss直聘 chat page URL for the target position.

- [ ] **Step 4: Start the service**

Run: `npm start`
Expected output:
```
[recruitment-bot] Starting recruitment-bot service...
[store] Database initialized at .../data/recruitment.db
[scraper] Connected to browser
[recruitment-bot] Service started, scanning every 300s...
```

- [ ] **Step 5: Verify SQLite results**

Run:
```bash
sqlite3 data/recruitment.db "SELECT c.name, r.status, r.score FROM screening_results r JOIN candidates c ON r.candidate_id = c.id"
```
Expected: Rows showing candidate names with passed/rejected status and scores.

- [ ] **Step 6: Verify deduplication**

Restart the service with `npm start`. Verify the log shows:
```
[scraper] Skipped X already-processed candidates
```

- [ ] **Step 7: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final adjustments after e2e verification"
```
