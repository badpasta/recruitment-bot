import { describe, it, expect } from "vitest";
import {
  loadMeetingConfig,
  renderTopic,
  calcEndTime,
} from "../../src/meeting/config.js";
import type { MeetingConfig } from "../../src/meeting/types.js";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("loadMeetingConfig", () => {
  it("loads and parses a valid meeting YAML config", () => {
    const config = loadMeetingConfig(resolve(fixturesDir, "valid.yaml"));
    expect(config.topicTemplate).toBe("面试 - {candidateName} / {positionName}");
    expect(config.durationMinutes).toBe(60);
    expect(config.webUrl).toBe("https://meeting.tencent.com/");
  });

  it("returns a MeetingConfig with correct shape", () => {
    const config = loadMeetingConfig(resolve(fixturesDir, "valid.yaml"));
    expect(typeof config.topicTemplate).toBe("string");
    expect(typeof config.durationMinutes).toBe("number");
    expect(typeof config.webUrl).toBe("string");
  });

  it("converts snake_case YAML keys to camelCase", () => {
    const config = loadMeetingConfig(resolve(fixturesDir, "valid.yaml"));
    expect(config).toHaveProperty("topicTemplate");
    expect(config).toHaveProperty("durationMinutes");
    expect(config).toHaveProperty("webUrl");
    expect(config).not.toHaveProperty("topic_template");
    expect(config).not.toHaveProperty("duration_minutes");
    expect(config).not.toHaveProperty("web_url");
  });
});

describe("renderTopic", () => {
  it("renders template placeholders with values", () => {
    const result = renderTopic(
      "面试 - {candidateName} / {positionName}",
      "张三",
      "前端工程师",
    );
    expect(result).toBe("面试 - 张三 / 前端工程师");
  });

  it("renders with a different template pattern", () => {
    const result = renderTopic(
      "{candidateName} 的面试 - {positionName}",
      "李四",
      "后端工程师",
    );
    expect(result).toBe("李四 的面试 - 后端工程师");
  });

  it("handles repeated placeholders", () => {
    const result = renderTopic(
      "{candidateName} / {candidateName} - {positionName}",
      "王五",
      "测试",
    );
    expect(result).toBe("王五 / 王五 - 测试");
  });

  it("handles template without placeholders", () => {
    const config: MeetingConfig = {
      topicTemplate: "固定面试主题",
      durationMinutes: 60,
      webUrl: "https://meeting.tencent.com/",
    };
    // renderTopic uses template directly
    const result = renderTopic(config.topicTemplate, "赵六", "设计");
    expect(result).toBe("固定面试主题");
  });
});

describe("calcEndTime", () => {
  it("calculates end time by adding duration minutes", () => {
    const startTime = "2026-06-16T10:00:00+08:00";
    const endTime = calcEndTime(startTime, 60);
    expect(endTime).toBe("2026-06-16T11:00:00+08:00");
  });

  it("handles 30-minute duration", () => {
    const startTime = "2026-06-16T14:30:00+08:00";
    const endTime = calcEndTime(startTime, 30);
    expect(endTime).toBe("2026-06-16T15:00:00+08:00");
  });

  it("handles cross-hour boundary", () => {
    const startTime = "2026-06-16T09:45:00+08:00";
    const endTime = calcEndTime(startTime, 45);
    expect(endTime).toBe("2026-06-16T10:30:00+08:00");
  });

  it("handles cross-midnight", () => {
    const startTime = "2026-06-16T23:30:00+08:00";
    const endTime = calcEndTime(startTime, 60);
    expect(endTime).toBe("2026-06-17T00:30:00+08:00");
  });

  it("returns valid ISO 8601 string", () => {
    const startTime = "2026-06-16T10:00:00+08:00";
    const endTime = calcEndTime(startTime, 60);
    const parsed = new Date(endTime);
    expect(parsed.toISOString()).toBeTruthy();
    expect(isNaN(parsed.getTime())).toBe(false);
  });
});
