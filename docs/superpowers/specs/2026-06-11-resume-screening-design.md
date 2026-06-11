# Boss直聘简历筛选系统设计

**日期**: 2026-06-11
**对应 Issue**: ZHU-4
**状态**: 设计完成，待实施

## 1. 概述

构建一个长驻后台服务，通过 kimi-webbridge 控制用户已登录的浏览器，自动从 Boss直聘平台获取候选人简历信息，根据 YAML 配置文件定义的筛选规则进行匹配打分，将筛选结果持久化存储，供后续邮件推送模块（ZHU-5）消费。

## 2. 关键决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 浏览器自动化 | kimi-webbridge | 复用用户真实浏览器登录态，比传统爬虫更稳定 |
| 筛选条件管理 | YAML 配置文件 | 结构化、版本可控、修改直观 |
| 技术栈 | TypeScript / Node.js | 团队技术栈统一 |
| 架构模式 | 长驻后台服务 | 全自动运行，无需人工触发 |
| 持久化 | SQLite | 轻量级，无需额外部署数据库 |

## 3. 整体架构

```
┌─────────────────────────────────────────────┐
│            recruitment-bot service           │
│                                             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐ │
│  │ Scheduler│─▶│  Scraper  │─▶│ Screener │ │
│  │ (轮询)   │  │(浏览器控制)│  │(规则匹配)│ │
│  └──────────┘  └───────────┘  └──────────┘ │
│       │              │              │       │
│       ▼              ▼              ▼       │
│  ┌──────────────────────────────────────┐   │
│  │           State Store (SQLite)       │   │
│  │  - 已处理的候选人（去重）              │   │
│  │  - 筛选结果与状态                     │   │
│  │  - 运行状态与检查点                   │   │
│  └──────────────────────────────────────┘   │
│                      │                      │
│                      ▼                      │
│              ┌──────────────┐               │
│              │   Output     │               │
│              │(事件/JSON)   │──▶ ZHU-5 消费 │
│              └──────────────┘               │
└─────────────────────────────────────────────┘
```

### 核心模块

1. **Scheduler（调度器）**: 定时触发扫描，默认每 5 分钟一轮（可配置），避免过于频繁触发反爬
2. **Scraper（抓取器）**: 通过 kimi-webbridge 控制浏览器，导航到 Boss直聘指定职位的候选人列表，提取简历信息
3. **Screener（筛选器）**: 读取 YAML 配置的筛选规则，对候选人简历进行匹配打分，输出通过/不通过 + 匹配度分数
4. **State Store（状态存储）**: SQLite 数据库，记录已处理候选人（去重）、筛选结果、运行状态
5. **Output（输出）**: 筛选通过的结果以事件/JSON 形式输出，供 ZHU-5（邮件推送）消费

## 4. Scraper 模块详细设计

### 工作流程

1. 通过 kimi-webbridge 连接用户已登录的浏览器
2. 导航到 Boss直聘「与我沟通过」的候选人列表页
3. 按职位筛选（从配置文件读取目标职位 URL）
4. 逐页遍历候选人列表，提取每人摘要信息：
   - 姓名、头像、年龄
   - 离职状态（在职-暂不考虑 / 在职-考虑机会 / 离职-随时到岗 等）
   - 学历、工作年限
   - 期望薪资
5. 对未处理过的候选人，点击进入详情页，提取完整简历：
   - 技能标签
   - 工作经历（公司、职位、时间段、描述）
   - 项目经历
   - 自我评价
6. 返回列表继续下一位

### 防检测策略

- 每次操作间加入随机延迟（2-5 秒）
- 每轮扫描限制处理候选人数量（默认 20 人/轮）
- 模拟人工滚动和点击模式

### 候选人唯一标识

使用 Boss直聘候选人详情页 URL 中的唯一标识参数（如 `geek_card` 或 URL path 中的 ID）作为去重 key。不依赖姓名（可能重名），不依赖完整 URL（可能带多余参数）。

## 5. Screener 模块详细设计

### YAML 配置文件格式

```yaml
positions:
  - name: "中级运维工程师_北京 16-18k"
    boss_url: "https://www.zhipin.com/..."

    screening:
      # 硬性条件（必须全部满足才通过）
      required:
        - field: "status"
          not_in: ["在职-暂不考虑"]
        - field: "skills"
          contains_any: ["k8s", "kubernetes", "K8S"]
        - field: "skills"
          contains_any: ["ci/cd", "jenkins", "gitlab ci", "github actions"]

      # 加分条件（满足越多分数越高）
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

      # 通过门槛
      pass_threshold: 15
```

### 匹配逻辑

1. 先检查硬性条件（required），任一不满足则直接淘汰
2. 硬性条件全部满足则计算加分项总分
3. 总分 >= pass_threshold 则通过，记录分数和匹配详情
4. 字段匹配采用大小写不敏感的子串匹配（如技能标签"K8S经验"转为小写后包含"k8s"即匹配）。不做语义级别的模糊匹配，保持逻辑简单可预测。

### 支持的筛选操作符

| 操作符 | 说明 | 适用字段类型 |
|---|---|---|
| `contains_any` | 包含任一关键字即匹配 | skills, experience |
| `contains_all` | 包含所有关键字才匹配 | skills, experience |
| `not_in` | 值不在列表中 | status |
| `in` | 值在列表中 | status, education |
| `min` / `max` | 数值范围 | experience_years, salary_expectation |

## 6. State Store 详细设计（SQLite）

### 表结构

```sql
-- 候选人表
CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  name TEXT,
  profile_url TEXT,
  raw_profile JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 筛选结果表
CREATE TABLE screening_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT REFERENCES candidates(id),
  position_name TEXT,
  status TEXT,                  -- passed / rejected / pending
  score INTEGER,
  match_details JSON,
  screened_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 运行状态表
CREATE TABLE run_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 关键运行状态

| key | 说明 |
|---|---|
| `last_scan_time` | 上次扫描完成时间 |
| `last_candidate_id` | 上次处理到的候选人 ID（断点续扫） |
| `error_count` | 连续错误计数 |
| `is_paused` | 是否暂停（登录过期时自动暂停） |

## 7. 错误处理与恢复

| 场景 | 处理方式 |
|---|---|
| 浏览器连接断开 | 自动重连 kimi-webbridge，从上次检查点恢复 |
| Boss直聘登录过期 | 记录状态，暂停扫描，在控制台输出醒目告警日志，用户重新登录后服务自动恢复 |
| 页面结构变更 | 解析失败时保存页面截图，跳过该候选人，记录错误日志 |
| 限流/反爬检测 | 自动退避（指数退避，最长等待 30 分钟） |
| SQLite 写入失败 | 重试 3 次后记录错误日志，跳过该候选人 |

## 8. 项目结构

```
recruitment-bot/
├── src/
│   ├── index.ts              # 入口，启动后台服务
│   ├── config/
│   │   └── loader.ts         # YAML 配置加载与校验
│   ├── scheduler/
│   │   └── index.ts          # 定时调度器
│   ├── scraper/
│   │   ├── index.ts          # 抓取器主逻辑
│   │   ├── boss-zhipin.ts    # Boss直聘页面解析
│   │   └── webbridge.ts      # kimi-webbridge 封装
│   ├── screener/
│   │   ├── index.ts          # 筛选引擎
│   │   └── matcher.ts        # 规则匹配器
│   ├── store/
│   │   ├── index.ts          # SQLite 初始化
│   │   ├── candidates.ts     # 候选人 CRUD
│   │   └── results.ts        # 筛选结果 CRUD
│   └── types/
│       └── index.ts          # 类型定义
├── config/
│   └── screening.yaml        # 筛选规则配置
├── data/
│   └── recruitment.db        # SQLite 数据库（运行时生成）
├── package.json
├── tsconfig.json
└── README.md
```

## 9. 接口约定（供 ZHU-5 消费）

筛选通过的候选人数据以 JSON 格式写入 `screening_results` 表，ZHU-5 模块通过查询 `status = 'passed'` 的记录来获取待推送的简历。

每条记录的 `match_details` 字段格式：

```json
{
  "required_matched": [
    {"field": "status", "rule": "not_in", "passed": true},
    {"field": "skills", "rule": "contains_any", "matched": ["k8s"], "passed": true},
    {"field": "skills", "rule": "contains_any", "matched": ["jenkins"], "passed": true}
  ],
  "preferred_matched": [
    {"field": "skills", "rule": "contains_any", "matched": ["docker"], "weight": 10, "passed": true},
    {"field": "skills", "rule": "contains_any", "matched": [], "weight": 8, "passed": false}
  ],
  "total_score": 25,
  "threshold": 15
}
```
