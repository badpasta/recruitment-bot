import { describe, it, expect } from "vitest";
import { buildEmailHtml, buildEmailSubject } from "../../src/email/sender.js";
import type { EmailNotificationData } from "../../src/types/index.js";

const sampleData: EmailNotificationData = {
  candidateName: "张三",
  positionName: "中级运维工程师_北京 16-18k",
  score: 25,
  skills: ["k8s", "docker", "jenkins"],
  profileUrl: "https://www.zhipin.com/geek/card/abc123",
  candidateId: "abc123",
  resultId: 1,
};

describe("buildEmailSubject", () => {
  it("formats subject with position name, candidate name, and score", () => {
    const subject = buildEmailSubject(sampleData);
    expect(subject).toBe("[招聘筛选] 中级运维工程师_北京 16-18k - 张三 (匹配度: 25分)");
  });

  it("handles zero score", () => {
    const data = { ...sampleData, score: 0 };
    const subject = buildEmailSubject(data);
    expect(subject).toContain("匹配度: 0分");
  });
});

describe("buildEmailHtml", () => {
  it("contains candidate name", () => {
    const html = buildEmailHtml(sampleData);
    expect(html).toContain("张三");
  });

  it("contains position name", () => {
    const html = buildEmailHtml(sampleData);
    expect(html).toContain("中级运维工程师_北京 16-18k");
  });

  it("contains score", () => {
    const html = buildEmailHtml(sampleData);
    expect(html).toContain("25分");
  });

  it("contains skills as comma-separated list", () => {
    const html = buildEmailHtml(sampleData);
    expect(html).toContain("k8s, docker, jenkins");
  });

  it("contains profile URL as link", () => {
    const html = buildEmailHtml(sampleData);
    expect(html).toContain('href="https://www.zhipin.com/geek/card/abc123"');
  });

  it("shows '无' for empty skills", () => {
    const data = { ...sampleData, skills: [] };
    const html = buildEmailHtml(data);
    expect(html).toContain("无");
  });

  it("contains keyword instructions for reply", () => {
    const html = buildEmailHtml(sampleData);
    expect(html).toContain("约面试");
    expect(html).toContain("淘汰");
  });

  it("escapes HTML special characters in candidate name", () => {
    const data = { ...sampleData, candidateName: "<script>alert('xss')</script>" };
    const html = buildEmailHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
