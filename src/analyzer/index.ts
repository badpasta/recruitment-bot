import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import yaml from "js-yaml";
import type { InterviewFeedbackStore } from "../store/interview-feedback.js";
import type { StrategyAdjustment, StrategyAnalysisResult } from "../types/index.js";
import type { AppConfig } from "../types/index.js";

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

function loadConfigRaw(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

function buildSystemPrompt(): string {
  return `你是一位招聘筛选策略分析师。你需要分析面试反馈数据，并与当前的筛选配置进行对比，生成结构化的策略调整建议。

输出格式必须是严格的 JSON，包含一个 "adjustments" 数组，每个元素格式如下：
{
  "type": "add" | "modify" | "delete",
  "targetRule": {
    "field": "规则字段名",
    "position": "required" | "preferred",
    "containsAny": ["关键词1"],
    "min": 数字 (可选),
    "max": 数字 (可选),
    "weight": 数字 (仅 preferred 规则)
  },
  "reason": "调整理由"
}

分析原则：
1. 关注面试反馈中反复出现的技术栈或技能缺口
2. 如果某个技能在通过和不通过的候选人中都频繁出现，可能不需要作为筛选条件
3. 如果某个技能是区分优质候选人的关键因素但当前配置未覆盖，建议增加
4. 如果某个规则导致过多误筛（pass但面试反馈差），建议修改或删除
5. 建议必须基于实际反馈数据，不可以凭空猜测

只输出 JSON，不要包含其他文字。`;
}

function buildUserMessage(
  feedbacks: ReturnType<InterviewFeedbackStore["getRecent"]>,
  configRaw: string,
): string {
  const feedbackSummaries = feedbacks.map((fb, i) => {
    const dimSummary = fb.dimensions
      .map((d) => `  - ${d.name}: ${d.rating}/5${d.comment ? ` (${d.comment})` : ""}`)
      .join("\n");
    return [
      `### 反馈 #${i + 1}`,
      `候选人: ${fb.candidateId}`,
      `推荐: ${fb.recommended ? "是" : "否"}`,
      `面试官: ${fb.interviewerName}`,
      `综合评语: ${fb.overallComment}`,
      `维度评分:`,
      dimSummary,
    ].join("\n");
  });

  return [
    `## 当前筛选配置 (screening.yaml)`,
    "```yaml",
    configRaw,
    "```",
    "",
    `## 面试反馈数据（共 ${feedbacks.length} 条）`,
    ...feedbackSummaries,
    "",
    "请分析以上数据，生成策略调整建议。只输出 JSON。",
  ].join("\n");
}

const MAX_TOKENS = 4096;

export class AIStrategyAnalyzer {
  private client: Anthropic;

  constructor(
    private feedbackStore: InterviewFeedbackStore,
    private configPath: string,
    anthropicApiKey: string,
  ) {
    this.client = new Anthropic({ apiKey: anthropicApiKey });
  }

  async analyze(feedbackLimit: number): Promise<StrategyAnalysisResult> {
    const feedbacks = this.feedbackStore.getRecent(feedbackLimit);
    const configRaw = loadConfigRaw(this.configPath);

    if (feedbacks.length === 0) {
      return {
        adjustments: [],
        analyzedFeedbackCount: 0,
        analyzedAt: new Date().toISOString(),
      };
    }

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildUserMessage(feedbacks, configRaw),
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    let parsed: { adjustments: StrategyAdjustment[] };
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      throw new Error(`Failed to parse AI response as JSON: ${text.slice(0, 200)}`);
    }

    if (!parsed.adjustments || !Array.isArray(parsed.adjustments)) {
      throw new Error(`AI response missing "adjustments" array: ${text.slice(0, 200)}`);
    }

    return {
      adjustments: parsed.adjustments,
      analyzedFeedbackCount: feedbacks.length,
      analyzedAt: new Date().toISOString(),
    };
  }
}
