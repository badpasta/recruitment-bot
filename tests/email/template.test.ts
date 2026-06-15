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
    const subject = buildEmailSubject(mockResult, "张三");
    expect(subject).toBe(
      "[招聘筛选] 中级运维工程师_北京 16-18k - 张三 (匹配度: 25分)",
    );
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
