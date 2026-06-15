# 面试调度系统设计 (ZHU-6)

**日期**: 2026-06-15 | **对应 Issue**: ZHU-6 | **状态**: 待确认

## 1. 概述

构建面试调度模块，当候选人在 `screening_results` 中被标记为 `interview` 状态时（由 ZHU-5 邮件回复触发），自动完成面试安排全流程：候选人入库 → 可用时间匹配 → 通过 Boss直聘沟通时间 → 预定腾讯会议 → 写入日历 → 处理时间冲突。

该模块作为 `recruitment-bot` 服务的新子系统运行，复用现有的 SQLite 存储、kimi-webbridge 浏览器控制和配置加载机制。

## 2. 关键决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 数据持久化 | SQLite（扩展现有库） | 与现有架构一致，无额外依赖 |
| 时间沟通方式 | kimi-webbridge HTTP API | 复用现有浏览器控制层，Boss直聘无公开 API |
| 腾讯会议接入 | Tencent Meeting REST API (V3) | 官方 API，支持预定会议、获取会议链接 |
| 日历接入 | CalDAV 协议 | 通用协议，兼容 iCloud/Google/Outlook 等主流日历服务 |
| 时间协商模式 | 异步轮询 | 候选人回复不可预测，轮询 Boss直聘消息列表获取回复 |
| 面试调度状态 | 状态机 | 明确的候选人面试生命周期管理 |

## 3. 面试调度状态机

```
┌────────────┐     ┌──────────────┐     ┌──────────────┐
│  intake     │────▶│  pending_slot │────▶│  confirmed    │
│  (入库)     │     │  (等待确认)   │     │  (时间确认)   │
└────────────┘     └──────────────┘     └──────────────┘
                        │                      │
                        │ (超时/拒绝)           │
                        ▼                      ▼
                   ┌──────────────┐     ┌──────────────┐
                   │  declined    │     │  meeting_set  │
                   │  (已拒绝)    │     │  (会议已预定) │
                   └──────────────┘     └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │  scheduled    │
                                        │  (日历已写入) │
                                        └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │  completed    │
                                        │  (面试完成)   │
                                        └──────────────┘

冲突处理:
  confirmed → 预定失败(冲突) → pending_slot (推荐下一可用时间)
```

### 状态说明

| 状态 | 含义 | 触发条件 |
|---|---|---|
| `intake` | 候选人刚从 ZHU-5 进入面试流程 | `screening_results.status` 变为 `interview` |
| `pending_slot` | 已向候选人发送时间选项，等待回复 | 消息发送成功 |
| `confirmed` | 候选人确认了面试时间 | 从 Boss直聘消息中解析到时间确认 |
| `declined` | 候选人拒绝或超时未回复 | 候选人明确拒绝 或 超过配置的天数未回复 |
| `meeting_set` | 腾讯会议已预定成功 | 腾讯会议 API 返回会议信息 |
| `scheduled` | 日历事件已写入 | CalDAV 写入成功 |
| `completed` | 面试已完成（由 ZHU-7 更新） | 面试结束后手动或自动标记 |

## 4. 数据模型扩展

### 4.1 新增表：`interview_candidates`

```sql
CREATE TABLE IF NOT EXISTS interview_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  position_name TEXT NOT NULL,
  screening_result_id INTEGER NOT NULL REFERENCES screening_results(id),
  status TEXT NOT NULL DEFAULT 'intake'
    CHECK(status IN ('intake','pending_slot','confirmed','declined',
                     'meeting_set','scheduled','completed')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_candidates_unique
  ON interview_candidates(candidate_id, position_name);

CREATE INDEX IF NOT EXISTS idx_interview_candidates_status
  ON interview_candidates(status);
```

### 4.2 新增表：`interview_schedule`

```sql
CREATE TABLE IF NOT EXISTS interview_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interview_candidate_id INTEGER NOT NULL REFERENCES interview_candidates(id),
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  position_name TEXT NOT NULL,
  interview_time TEXT NOT NULL,           -- ISO 8601: "2026-06-15T10:00:00+08:00"
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  tencent_meeting_id TEXT,                -- 腾讯会议返回的会议 ID
  tencent_meeting_link TEXT,              -- 会议入会链接
  tencent_meeting_code TEXT,              -- 9位会议号
  calendar_event_id TEXT,                 -- CalDAV 返回的事件 UID
  calendar_event_url TEXT,                -- CalDAV 事件 URL
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','booked','cancelled','completed')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interview_schedule_time
  ON interview_schedule(interview_time);

CREATE INDEX IF NOT EXISTS idx_interview_schedule_candidate
  ON interview_schedule(candidate_id);
```

### 4.3 新增表：`interview_messages`

记录与候选人在 Boss直聘上的消息往来，用于追踪沟通历史和解析回复。

```sql
CREATE TABLE IF NOT EXISTS interview_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interview_candidate_id INTEGER NOT NULL REFERENCES interview_candidates(id),
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  content TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interview_messages_candidate
  ON interview_messages(interview_candidate_id);
```

### 4.4 现有表变更

**`screening_results` 表 status 字段扩展 CHECK 约束：**

当前 CHECK 约束为 `('passed', 'rejected', 'pending')`，需要扩展支持 `interview` 和 `eliminated` 状态（ZHU-5 已引入这些状态）。

```sql
-- 需要 ALTER TABLE 或重建表以更新 CHECK 约束
-- 方案：重建 screening_results 表（SQLite 不支持 ALTER CHECK）
ALTER TABLE screening_results RENAME TO screening_results_old;

CREATE TABLE screening_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  position_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN
    ('passed','rejected','pending','interview','eliminated')),
  score INTEGER NOT NULL DEFAULT 0,
  match_details JSON NOT NULL,
  screened_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO screening_results SELECT * FROM screening_results_old;
DROP TABLE screening_results_old;

-- 重建索引
CREATE INDEX IF NOT EXISTS idx_screening_results_status
  ON screening_results(status);
CREATE INDEX IF NOT EXISTS idx_screening_results_candidate
  ON screening_results(candidate_id);
```

**BrowserClient 接口扩展：**

```typescript
// 新增方法（kimi-webbridge 已支持这些 action）
interface BrowserClient {
  // ... 现有方法 ...
  fill(selector: string, value: string): Promise<void>;  // 输入文本
  screenshot(): Promise<string>;                          // 截图（调试用）
}
```

## 5. 配置文件扩展

在现有 `screening.yaml` 中新增 `interview` 段：

```yaml
# --- 现有配置保持不变 ---
positions:
  - name: "中级运维工程师_北京 16-18k"
    # ... screening rules ...

# --- 新增面试调度配置 ---
interview:
  # 可用面试时间段
  available_slots:
    - "2026-06-16 10:00-12:00"
    - "2026-06-16 14:00-17:00"
    - "2026-06-17 10:00-12:00"
    - "2026-06-17 14:00-17:00"

  # 每场面试时长（分钟）
  duration_minutes: 60

  # 时间间隔（分钟）—— 面试之间的缓冲
  buffer_minutes: 15

  # 候选人回复超时（天）
  reply_timeout_days: 3

  # 每轮提供的可选时间数量
  max_options_per_round: 3

  # 消息模板（发送给候选人）
  message_template: |
    您好 {name}，感谢您对我们{position}职位的兴趣！
    我们希望安排一次线上面试，以下是可选时间：
    {slots}
    请回复对应的时间编号（如"1"），或告知您的其他可用时间。

  # 腾讯会议配置
  tencent_meeting:
    app_id: "${TENCENT_MEETING_APP_ID}"
    secret_id: "${TENCENT_MEETING_SECRET_ID}"
    secret_key: "${TENCENT_MEETING_SECRET_KEY}"
    # 预定的会议主题前缀
    subject_prefix: "面试"
    # 会议类型: 0=预约会议
    instance_type: 1

  # 日历配置
  calendar:
    # CalDAV 服务器配置
    provider: "caldav"
    server_url: "${CALDAV_SERVER_URL}"
    username: "${CALDAV_USERNAME}"
    password: "${CALDAV_PASSWORD}"
    calendar_path: "${CALDAV_CALENDAR_PATH}"
    # 事件标题模板
    event_title_template: "面试 - {name} / {position}"
    # 事件描述模板
    event_description_template: |
      候选人: {name}
      职位: {position}
      匹配分数: {score}
      技能: {skills}

      腾讯会议:
      会议号: {meeting_code}
      链接: {meeting_link}

      简历摘要:
      {resume_summary}
```

## 6. 模块设计

### 6.1 整体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                      recruitment-bot service                         │
│                                                                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ Scheduler│─▶│  Scraper  │─▶│ Screener │─▶│  InterviewScheduler │ │
│  │ (轮询)   │  │(浏览器控制)│  │(规则匹配)│  │  (面试调度)          │ │
│  └──────────┘  └───────────┘  └──────────┘  └─────────────────────┘ │
│       │                                              │               │
│       ▼                                              ▼               │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                        State Store (SQLite)                      ││
│  │  candidates | screening_results | interview_candidates |         ││
│  │  interview_schedule | interview_messages | run_state             ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  InterviewScheduler 内部模块:                                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │  Intake    │ │ SlotMgr    │ │ Messenger  │ │ MeetingBooker    │  │
│  │  (入库)    │ │ (时间管理)  │ │ (Boss沟通) │ │ (腾讯会议预定)   │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
│                                                    │                 │
│                                               ┌────▼────┐            │
│                                               │Calendar │            │
│                                               │Writer   │            │
│                                               └─────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Intake 模块（面试候选人入库）

**职责**：检测 `screening_results` 中新增的 `interview` 状态记录，将候选人写入 `interview_candidates` 表。

**触发条件**：Scheduler 每轮扫描时调用。

**流程**：

```
1. 查询 screening_results WHERE status = 'interview'
2. 对每条记录：
   a. 检查 interview_candidates 是否已存在 (candidate_id + position_name)
   b. 如不存在，插入 interview_candidates，status = 'intake'
   c. 日志记录："New interview candidate: {name} for {position}"
3. 返回新入库的候选人列表，供后续 SlotManager 处理
```

**去重机制**：`UNIQUE INDEX (candidate_id, position_name)` 确保同一候选人同一职位不会重复入库。

### 6.3 SlotManager 模块（时间管理）

**职责**：管理可用时间段，生成候选人可选时间，处理时间冲突。

**核心逻辑**：

```
1. 从配置加载 available_slots（格式: "YYYY-MM-DD HH:MM-HH:MM"）
2. 将时间段拆分为 duration_minutes 长度的 slot：
   "2026-06-16 10:00-12:00" + duration=60min → 
   [10:00-11:00, 11:00-12:00]
3. 加入 buffer_minutes 缓冲：
   [10:00-11:00, 11:15-12:15]  ← 实际上第二场从 11:15 开始
4. 排除已占用的 slot（查询 interview_schedule 中已有记录）
5. 取前 max_options_per_round 个可用 slot 作为候选选项
```

**时间冲突检测**：

```
给定新 slot [start, end]：
  SELECT COUNT(*) FROM interview_schedule
  WHERE status IN ('booked', 'pending')
    AND interview_time < end
    AND datetime(interview_time, '+' || duration_minutes || ' minutes') > start
```

如果冲突，自动推荐下一个可用 slot。

**Slot 数据结构**：

```typescript
interface InterviewSlot {
  startTime: string;  // ISO 8601
  endTime: string;    // ISO 8601
  label: string;      // "6月16日 10:00-11:00"（人类可读）
  available: boolean;
}
```

### 6.4 Messenger 模块（Boss直聘沟通）

**职责**：通过 kimi-webbridge 在 Boss直聘上向候选人发送面试时间选项，并轮询获取候选人回复。

**发送消息流程**：

```
1. 通过 kimi-webbridge 导航到 Boss直聘聊天页面
2. 在候选人列表中搜索目标候选人（按姓名匹配）
3. 点击候选人进入聊天窗口
4. 将消息模板填充为实际内容（替换 {name}, {position}, {slots}）
5. 在消息输入框中输入内容
6. 点击发送按钮
7. 记录 outbound 消息到 interview_messages 表
```

**轮询回复流程**：

```
1. 对每个 status = 'pending_slot' 的候选人：
   a. 导航到与该候选人的聊天页面
   b. 读取最新消息（evaluate JS 提取消息列表）
   c. 检查是否有新的 inbound 消息（对比上次读取时间）
   d. 如有新消息，解析回复内容：
      - 回复包含数字编号（如"1"、"2"）→ 映射到对应时间 slot
      - 回复包含日期时间文本 → 尝试解析为具体时间
      - 回复表示拒绝 → 标记 declined
      - 无法解析 → 记录日志，等待人工介入
   e. 记录 inbound 消息到 interview_messages 表
2. 超时检查：
   - 超过 reply_timeout_days 未回复 → 标记 declined
```

**消息解析逻辑**：

```typescript
interface ParsedReply {
  type: 'slot_selected' | 'custom_time' | 'declined' | 'unknown';
  selectedSlotIndex?: number;  // 0-based
  customTime?: string;         // ISO 8601
  rawText: string;
}

function parseCandidateReply(text: string, offeredSlots: InterviewSlot[]): ParsedReply {
  // 1. 检查是否为数字选择: "1", "选1", "第一个", "第一个时间"
  // 2. 检查是否包含时间关键词: "周一上午", "6月16号下午"
  // 3. 检查是否为拒绝: "不去", "不考虑", "拒绝"
  // 4. 无法识别 → unknown
}
```

**kimi-webbridge 调用序列（发送消息）**：

```
POST /command  →  navigate to Boss直聘 chat page
POST /command  →  evaluate: 搜索候选人姓名
POST /command  →  click: 候选人聊天项
POST /command  →  evaluate: 获取消息输入框 selector
POST /command  →  fill: 输入消息内容
POST /command  →  click: 发送按钮
POST /command  →  evaluate: 验证消息发送成功
```

### 6.5 MeetingBooker 模块（腾讯会议预定）

**职责**：调用腾讯会议 REST API 预定会议，获取会议链接和会议号。

**腾讯会议 API 接入方案**：

**认证方式**：TC3-HMAC-SHA256 签名认证

```
请求头:
  X-TC-Key: {secret_id}
  X-TC-Timestamp: {unix_timestamp}
  X-TC-Nonce: {random_int}
  X-TC-Signature: {hmac_sha256_signature}
  AppId: {app_id}
```

**预定会议 API**：

```
POST https://api.meeting.qq.com/v1/meetings

请求体:
{
  "userid": "recruitment-bot",       // 创建者标识
  "instanceid": 1,                    // 设备类型: 1=PC
  "subject": "面试 - 张三 / 中级运维工程师",
  "type": 0,                          // 预约会议
  "start_time": "1718420400",         // Unix 时间戳（秒）
  "end_time": "1718424000",           // Unix 时间戳（秒）
  "invitees": [                       // 可选：邀请人
    {
      "userid": "candidate@example.com"
    }
  ],
  "settings": {
    "mute_enable_join": true,         // 入会静音
    "allow_unmute_self": true,
    "auto_record": false
  }
}

响应体:
{
  "meeting_id": "1234567890",
  "meeting_code": "123456789",
  "subject": "面试 - 张三 / 中级运维工程师",
  "start_time": "1718420400",
  "end_time": "1718424000",
  "join_url": "https://meeting.tencent.com/dm/xxxxxxxx",
  "invite_url": "https://meeting.tencent.com/s/xxxxxxxx"
}
```

**签名算法**：

```
signature = HMAC-SHA256(secret_key, sign_string)

sign_string = "{HTTPMethod}\n{HeaderNonce}\n{HeaderTimestamp}\n{RequestUri}\n{RequestBody}"

其中:
  HTTPMethod = "POST"
  HeaderNonce = X-TC-Nonce 值
  HeaderTimestamp = X-TC-Timestamp 值
  RequestUri = "/v1/meetings"
  RequestBody = JSON.stringify(request_body)
```

**预定流程**：

```
1. 从配置读取腾讯会议凭证（支持环境变量注入）
2. 构造请求体（subject 使用模板填充）
3. 计算签名
4. 发送 POST 请求
5. 解析响应，提取 meeting_id, meeting_code, join_url
6. 写入 interview_schedule 表
7. 更新 interview_candidates status → 'meeting_set'
```

**错误处理**：

| 错误码 | 含义 | 处理 |
|---|---|---|
| 200003 | 签名验证失败 | 检查凭证和时间戳 |
| 200005 | 会议时间冲突 | 触发 SlotManager 推荐下一可用时间 |
| 403 | 权限不足 | 日志告警，暂停调度 |
| 网络超时 | 连接失败 | 重试 3 次，间隔 5 秒 |

### 6.6 CalendarWriter 模块（日历写入）

**职责**：通过 CalDAV 协议将面试事件写入用户日历。

**CalDAV 接入方案**：

```
CalDAV 操作:
  - PUT  /calendar/{uid}.ics    → 创建/更新事件
  - DELETE /calendar/{uid}.ics  → 删除事件
  - PROPFIND /calendar/         → 列出事件
```

**iCalendar 事件格式**：

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//recruitment-bot//Interview Scheduler//CN
BEGIN:VEVENT
UID:{generated-uid}@recruitment-bot
DTSTART:20260616T100000
DTEND:20260616T110000
SUMMARY:面试 - 张三 / 中级运维工程师
DESCRIPTION:候选人: 张三\n职位: 中级运维工程师\n匹配分数: 25\n技能: k8s, docker, jenkins\n\n腾讯会议:\n会议号: 123456789\n链接: https://meeting.tencent.com/dm/xxx
LOCATION:腾讯会议 - 123456789
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR
```

**写入流程**：

```
1. 从 interview_schedule 读取面试信息
2. 从 candidates 读取候选人信息
3. 生成 VEVENT (UID = 基于 interview_schedule.id 的唯一标识)
4. 用事件标题/描述模板填充内容
5. HTTP PUT 到 CalDAV 服务器
6. 解析响应获取事件 URL
7. 更新 interview_schedule 的 calendar_event_id 和 calendar_event_url
8. 更新 interview_candidates status → 'scheduled'
```

**CalDAV HTTP 请求**：

```
PUT /{calendar_path}/{event_uid}.ics HTTP/1.1
Host: {caldav_server}
Authorization: Basic {base64(username:password)}
Content-Type: text/calendar; charset=utf-8
If-None-Match: *

{ical_body}
```

**错误处理**：

| 错误 | 处理 |
|---|---|
| 401 Unauthorized | 日志告警，暂停日历写入 |
| 409 Conflict | 事件已存在，尝试更新（PUT without If-None-Match） |
| 网络超时 | 重试 3 次 |
| CalDAV 服务不可用 | 标记为 `meeting_set`（不写日历），日志告警 |

### 6.7 ConflictHandler（时间冲突处理）

**职责**：在面试预定的任何环节检测并处理时间冲突。

**冲突检测点**：

1. **SlotManager 生成阶段**：生成可选时间时排除已占用的 slot
2. **MeetingBooker 预定阶段**：腾讯会议返回时间冲突时，自动切换
3. **CalendarWriter 写入阶段**：CalDAV 返回冲突时，尝试更新或重新安排

**冲突处理流程**：

```
1. 检测到冲突
2. 调用 SlotManager.getAvailableSlots() 获取下一批可用时间
3. 如果仍有可用时间：
   a. 向候选人发送新的时间选项（通过 Messenger）
   b. 更新 interview_candidates status → 'pending_slot'
   c. 记录冲突日志
4. 如果没有可用时间：
   a. 日志告警："No available slots remaining for {candidate}"
   b. 标记为 blocked 状态，等待人工介入
```

## 7. 新增类型定义

```typescript
// --- 面试候选人 ---
type InterviewStatus =
  | 'intake'
  | 'pending_slot'
  | 'confirmed'
  | 'declined'
  | 'meeting_set'
  | 'scheduled'
  | 'completed';

interface InterviewCandidate {
  id?: number;
  candidateId: string;
  positionName: string;
  screeningResultId: number;
  status: InterviewStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// --- 面试日程 ---
interface InterviewSchedule {
  id?: number;
  interviewCandidateId: number;
  candidateId: string;
  positionName: string;
  interviewTime: string;         // ISO 8601
  durationMinutes: number;
  tencentMeetingId?: string;
  tencentMeetingLink?: string;
  tencentMeetingCode?: string;
  calendarEventId?: string;
  calendarEventUrl?: string;
  status: 'pending' | 'booked' | 'cancelled' | 'completed';
  createdAt?: string;
  updatedAt?: string;
}

// --- 面试消息 ---
interface InterviewMessage {
  id?: number;
  interviewCandidateId: number;
  direction: 'outbound' | 'inbound';
  content: string;
  sentAt?: string;
}

// --- 时间 slot ---
interface InterviewSlot {
  startTime: string;             // ISO 8601
  endTime: string;               // ISO 8601
  label: string;                 // "6月16日 10:00-11:00"
  available: boolean;
}

// --- 候选人回复解析结果 ---
interface ParsedReply {
  type: 'slot_selected' | 'custom_time' | 'declined' | 'unknown';
  selectedSlotIndex?: number;
  customTime?: string;
  rawText: string;
}

// --- 腾讯会议 API ---
interface TencentMeetingRequest {
  userid: string;
  instanceid: number;
  subject: string;
  type: number;
  start_time: string;
  end_time: string;
  settings?: {
    mute_enable_join?: boolean;
    allow_unmute_self?: boolean;
    auto_record?: boolean;
  };
}

interface TencentMeetingResponse {
  meeting_id: string;
  meeting_code: string;
  subject: string;
  start_time: string;
  end_time: string;
  join_url: string;
  invite_url: string;
}

// --- 面试配置 ---
interface InterviewConfig {
  availableSlots: string[];       // "2026-06-16 10:00-12:00"
  durationMinutes: number;
  bufferMinutes: number;
  replyTimeoutDays: number;
  maxOptionsPerRound: number;
  messageTemplate: string;
  tencentMeeting: TencentMeetingConfig;
  calendar: CalendarConfig;
}

interface TencentMeetingConfig {
  appId: string;
  secretId: string;
  secretKey: string;
  subjectPrefix: string;
  instanceType: number;
}

interface CalendarConfig {
  provider: string;
  serverUrl: string;
  username: string;
  password: string;
  calendarPath: string;
  eventTitleTemplate: string;
  eventDescriptionTemplate: string;
}
```

## 8. 新增项目结构

```
recruitment-bot/
├── src/
│   ├── ... (现有模块不变)
│   ├── interview/                    # 新增: 面试调度子系统
│   │   ├── index.ts                  # InterviewScheduler 主入口
│   │   ├── intake.ts                 # Intake 模块: 候选人入库
│   │   ├── slot-manager.ts           # SlotManager: 时间管理
│   │   ├── messenger.ts              # Messenger: Boss直聘沟通
│   │   ├── meeting-booker.ts         # MeetingBooker: 腾讯会议预定
│   │   ├── calendar-writer.ts        # CalendarWriter: 日历写入
│   │   └── reply-parser.ts           # ReplyParser: 回复解析
│   ├── store/
│   │   ├── interview-candidates.ts   # 新增: InterviewCandidateStore
│   │   ├── interview-schedule.ts     # 新增: InterviewScheduleStore
│   │   └── interview-messages.ts     # 新增: InterviewMessageStore
│   └── types/
│       └── index.ts                  # 扩展: 新增面试相关类型
├── config/
│   └── screening.yaml                # 扩展: 新增 interview 配置段
└── tests/
    ├── interview/                    # 新增
    │   ├── intake.test.ts
    │   ├── slot-manager.test.ts
    │   ├── messenger.test.ts
    │   ├── meeting-booker.test.ts
    │   ├── calendar-writer.test.ts
    │   └── reply-parser.test.ts
    ├── store/
    │   ├── interview-candidates.test.ts
    │   ├── interview-schedule.test.ts
    │   └── interview-messages.test.ts
    └── e2e/
        └── interview-scheduling.test.ts
```

## 9. 完整流程时序图

```
User(Email)     ZHU-5         Scheduler    Intake      SlotMgr     Messenger    MeetingBooker  CalendarWriter
    │              │              │           │           │            │              │              │
    │──"约面试"──▶│              │           │           │            │              │              │
    │              │──status=     │           │           │            │              │              │
    │              │  interview──▶│           │           │            │              │              │
    │              │  (DB update) │           │           │            │              │              │
    │              │              │──scan()──▶│           │            │              │              │
    │              │              │           │──query    │            │              │              │
    │              │              │           │  interview│            │              │              │
    │              │              │           │  results──│            │              │              │
    │              │              │           │           │            │              │              │
    │              │              │           │──insert──▶│            │              │              │
    │              │              │           │  interview│            │              │              │
    │              │              │           │  candidate│            │              │              │
    │              │              │           │           │            │              │              │
    │              │              │           │           │──generate─▶│              │              │
    │              │              │           │           │  slots     │              │              │
    │              │              │           │           │◀──slots───│              │              │
    │              │              │           │           │            │              │              │
    │              │              │           │           │            │──send msg──▶│              │
    │              │              │           │           │            │  (Boss直聘)  │              │
    │              │              │           │           │            │  status=     │              │
    │              │              │           │           │            │  pending_slot│              │
    │              │              │           │           │            │              │              │
    │              │              │  ... 等待候选人回复 ...             │              │              │
    │              │              │           │           │            │              │              │
    │              │              │──poll()──────────────────────────▶│              │              │
    │              │              │           │           │            │──check reply│              │
    │              │              │           │           │            │  on Boss直聘 │              │
    │              │              │           │           │            │◀──"选1"─────│              │
    │              │              │           │           │            │              │              │
    │              │              │           │           │            │──parse──────▶│              │
    │              │              │           │           │            │  reply       │              │
    │              │              │           │           │            │  status=     │              │
    │              │              │           │           │            │  confirmed   │              │
    │              │              │           │           │            │              │              │
    │              │              │           │           │            │              │──book()────▶│
    │              │              │           │           │            │              │  Tencent API │
    │              │              │           │           │            │              │◀──meeting──│
    │              │              │           │           │            │              │  link+code   │
    │              │              │           │           │            │              │  status=     │
    │              │              │           │           │            │              │  meeting_set │
    │              │              │           │           │            │              │              │
    │              │              │           │           │            │              │        ┌─────│
    │              │              │           │           │            │              │        │write│
    │              │              │           │           │            │              │        │cal  │
    │              │              │           │           │            │              │        │event│
    │              │              │           │           │            │              │        └─────│
    │              │              │           │           │            │              │        status=
    │              │              │           │           │            │              │        scheduled
    │              │              │           │           │            │              │              │
```

## 10. 依赖关系

```
ZHU-4 (简历筛选) ──▶ ZHU-5 (邮件推送) ──▶ ZHU-6 (面试调度) ──▶ ZHU-7 (面试反馈)
                                         
ZHU-6 内部依赖:
  Intake ──▶ SlotManager ──▶ Messenger ──▶ MeetingBooker ──▶ CalendarWriter
                                            │
                                            └──▶ ConflictHandler ──▶ SlotManager (回路)
```

## 11. 环境变量

| 变量名 | 必需 | 说明 |
|---|---|---|
| `TENCENT_MEETING_APP_ID` | 是 | 腾讯会议 AppID |
| `TENCENT_MEETING_SECRET_ID` | 是 | 腾讯会议 SecretId |
| `TENCENT_MEETING_SECRET_KEY` | 是 | 腾讯会议 SecretKey |
| `CALDAV_SERVER_URL` | 是 | CalDAV 服务器地址 |
| `CALDAV_USERNAME` | 是 | CalDAV 用户名 |
| `CALDAV_PASSWORD` | 是 | CalDAV 密码 |
| `CALDAV_CALENDAR_PATH` | 是 | 日历路径（如 `/dav/user/calendar/`） |
| `WEBBRIDGE_ENDPOINT` | 否 | kimi-webbridge 地址（默认 `http://127.0.0.1:10086/command`） |

## 12. E2E 测试方案

使用 vitest + mock 外部依赖（kimi-webbridge、腾讯会议 API、CalDAV 服务器）。

### E2E-1: 完整面试调度流程（Happy Path）

**前置**:
- `screening_results` 中有 1 条 `status = 'interview'` 记录
- 配置 3 个 available_slots
- Mock BrowserClient 返回候选人聊天页面 + 候选人回复 "选1"
- Mock 腾讯会议 API 返回 meeting_id + join_url
- Mock CalDAV 返回 201 Created

**操作**: `InterviewScheduler.runCycle()`

**验证**:
- `interview_candidates` 表有 1 条记录，status = 'scheduled'
- `interview_schedule` 表有 1 条记录，含 tencent_meeting_link 和 calendar_event_id
- `interview_messages` 表有 outbound（时间选项）+ inbound（候选人回复）各 1 条
- Mock 腾讯会议 API 被调用 1 次
- Mock CalDAV PUT 被调用 1 次

### E2E-2: 时间冲突自动推荐

**前置**:
- `interview_schedule` 已有 1 条记录占用 "2026-06-16 10:00-11:00"
- 候选人选择 "选1"（对应的正是被占用的 slot）

**操作**: `InterviewScheduler.runCycle()` → 候选人回复 → 预定会议

**验证**:
- 系统检测到冲突
- 自动推荐下一个可用 slot
- `interview_messages` 有第二条 outbound（新时间选项）
- `interview_candidates` status 回退为 'pending_slot'

### E2E-3: 候选人超时未回复

**前置**:
- `interview_candidates` 有 1 条 status = 'pending_slot' 记录
- `interview_messages` 最后一条 outbound 的 sent_at 超过 reply_timeout_days
- Mock BrowserClient 返回无新消息

**操作**: `InterviewScheduler.runCycle()`

**验证**:
- `interview_candidates` status 更新为 'declined'
- 日志输出: "Candidate {name} timed out after {n} days"

### E2E-4: 候选人拒绝面试

**前置**:
- Mock BrowserClient 返回候选人回复 "不考虑了"

**操作**: `InterviewScheduler.runCycle()` → 解析回复

**验证**:
- `interview_candidates` status = 'declined'
- `interview_messages` 记录了 inbound 消息

### E2E-5: 腾讯会议 API 失败重试

**前置**:
- Mock 腾讯会议 API 前 2 次返回 500，第 3 次返回成功

**操作**: `MeetingBooker.book()`

**验证**:
- 第 3 次调用成功
- `interview_schedule` 记录正常写入
- 日志记录 2 次重试

### E2E-6: CalDAV 写入失败降级

**前置**:
- 腾讯会议预定成功
- Mock CalDAV 返回 503

**操作**: `InterviewScheduler.runCycle()`

**验证**:
- `interview_candidates` status = 'meeting_set'（非 'scheduled'）
- `interview_schedule` 有 tencent_meeting_link 但无 calendar_event_id
- 日志告警: "Calendar write failed, meeting still booked"

### E2E-7: 去重（同一候选人不重复入库）

**前置**:
- `interview_candidates` 已有 (candidate_id=X, position_name=Y) 记录
- `screening_results` 中同 candidate_id + position_name 仍为 interview

**操作**: `Intake.scan()`

**验证**:
- `interview_candidates` 无新增记录
- 日志: "Candidate {name} already in interview pipeline"

## 13. 线上真实环境验证方案

### 环境准备

1. kimi-webbridge daemon 运行中（`http://127.0.0.1:10086/command`）
2. Chrome 已登录 Boss直聘
3. Boss直聘上有至少 1 个 `status = 'interview'` 的候选人（通过 ZHU-5 邮件回复触发）
4. 腾讯会议 API 凭证已配置（环境变量）
5. CalDAV 服务器已配置（环境变量）

### 验证步骤

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| R1 | 设置 1 个近期可用时间 slot（如明天的某个时间） | 配置写入 screening.yaml |
| R2 | `npm start` 启动服务 | 日志输出 "Interview scheduler: found 1 new candidate" |
| R3 | 等待 Messenger 发送消息 | Boss直聘上候选人收到面试时间选项消息 |
| R4 | 手动模拟候选人回复（或等待真实回复） | 系统解析回复，status → confirmed |
| R5 | 腾讯会议预定 | `interview_schedule` 中有 meeting_link，链接可访问 |
| R6 | 日历写入 | 用户日历中出现面试事件，标题正确 |
| R7 | SQLite 验证 | `sqlite3 data/recruitment.db "SELECT * FROM interview_schedule"` 输出完整记录 |

### 成功标准

- 面试事件出现在日历中
- 腾讯会议链接可正常打开
- `interview_schedule` 表包含：候选人ID、面试时间、会议链接、日历事件ID
- Boss直聘上有发送给候选人的时间选项消息

## 14. Issues 拆分方案

按 MECE 原则拆分为可独立实施和测试的子 issues：

### 第一层：数据层 + 配置层（基础）

| # | Issue | 内容 | 依赖 |
|---|---|---|---|
| 6.1 | 面试数据模型与存储层 | 新建 `interview_candidates`、`interview_schedule`、`interview_messages` 三张表 + Store 类 + 类型定义 + 配置扩展 | 无 |

### 第二层：核心模块（可并行）

| # | Issue | 内容 | 依赖 |
|---|---|---|---|
| 6.2 | 面试候选人入库与时间管理 | Intake 模块 + SlotManager 模块 + ReplyParser 模块 | 6.1 |
| 6.3 | 腾讯会议预定模块 | MeetingBooker 模块（TC3 签名 + API 调用 + 错误处理） | 6.1 |
| 6.4 | 日历写入模块 | CalendarWriter 模块（CalDAV + iCal 生成 + 错误处理） | 6.1 |

### 第三层：集成层

| # | Issue | 内容 | 依赖 |
|---|---|---|---|
| 6.5 | Boss直聘消息沟通 | Messenger 模块（kimi-webbridge 发消息 + 轮询回复） | 6.2 |
| 6.6 | 面试调度主流程集成 | InterviewScheduler 编排器 + 冲突处理 + Scheduler 集成 + E2E 测试 | 6.2, 6.3, 6.4, 6.5 |

### 第四层：验收

| # | Issue | 内容 | 依赖 |
|---|---|---|---|
| 6.7 | 线上真实环境验证 | 完整 E2E 在真实环境运行 | 6.6 |

---

**本地 SPEC 路径**: `docs/superpowers/specs/2026-06-15-interview-scheduling-design.md`
