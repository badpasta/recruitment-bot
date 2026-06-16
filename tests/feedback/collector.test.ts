import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDatabase } from "../../src/store/db.js";
import { CandidateStore } from "../../src/store/candidates.js";
import { InterviewEventStore } from "../../src/store/interview-events.js";
import { InterviewFeedbackStore } from "../../src/store/interview-feedback.js";
import { EmailStore } from "../../src/store/email-store.js";
import { FeedbackCollector, buildFeedbackRequestHtml, buildFeedbackRequestSubject } from "../../src/feedback/collector.js";
import type { FeedbackRequestData } from "../../src/feedback/collector.js";

const sampleRequest: FeedbackRequestData = {
  candidateName: "张三",
  positionName: "高级后端工程师",
  interviewType: "视频面试",
  scheduledAt: "2026-06-20 10:00",
  candidateId: "c1",
  eventId: 1,
};

describe("buildFeedbackRequestSubject", () => {
  it("formats subject with candidate name and position", () => {
    const subject = buildFeedbackRequestSubject(sampleRequest);
    expect(subject).toContain("张三");
    expect(subject).toContain("高级后端工程师");
    expect(subject).toContain("面试反馈");
  });
});

describe("buildFeedbackRequestHtml", () => {
  it("contains candidate name", () => {
    const html = buildFeedbackRequestHtml(sampleRequest);
    expect(html).toContain("张三");
  });

  it("contains position name", () => {
    const html = buildFeedbackRequestHtml(sampleRequest);
    expect(html).toContain("高级后端工程师");
  });

  it("contains interview time and type", () => {
    const html = buildFeedbackRequestHtml(sampleRequest);
    expect(html).toContain("2026-06-20 10:00");
    expect(html).toContain("视频面试");
  });

  it("contains reply template instructions", () => {
    const html = buildFeedbackRequestHtml(sampleRequest);
    expect(html).toContain("技术能力");
    expect(html).toContain("总体评价");
    expect(html).toContain("推荐");
  });

  it("contains form link mode instructions", () => {
    const html = buildFeedbackRequestHtml(sampleRequest);
    expect(html).toContain("在线表单");
    expect(html).toContain("填写反馈表单");
  });

  it("HTML escapes candidate name", () => {
    const data = { ...sampleRequest, candidateName: "<script>alert('xss')</script>" };
    const html = buildFeedbackRequestHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("HTML escapes position name", () => {
    const data = { ...sampleRequest, positionName: "<b>bold</b>" };
    const html = buildFeedbackRequestHtml(data);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });
});

describe("FeedbackCollector", () => {
  let db: Database.Database;
  let candidates: CandidateStore;
  let events: InterviewEventStore;
  let feedbackStore: InterviewFeedbackStore;
  let emailStore: EmailStore;
  let collector: FeedbackCollector;
  let eventId: number;

  beforeEach(() => {
    db = initDatabase(":memory:");
    candidates = new CandidateStore(db);
    events = new InterviewEventStore(db);
    feedbackStore = new InterviewFeedbackStore(db);
    emailStore = new EmailStore(db);
    collector = new FeedbackCollector(feedbackStore, events, emailStore, candidates);

    candidates.upsert({
      id: "c1", name: "张三", profileUrl: "https://zhipin.com/geek/c1",
      rawProfile: { skills: ["k8s"], workHistory: [], projectHistory: [] },
    });
    eventId = events.insert({
      candidateId: "c1", positionName: "高级后端工程师",
      interviewType: "video", scheduledAt: "2026-06-20T10:00:00Z", status: "completed",
    });
  });

  afterEach(() => { db.close(); });

  describe("processFeedbackReply", () => {
    it("parses and stores feedback from a reply", () => {
      const messageId = "<abc@mail.example.com>";
      const replyText = `
技术能力: 4/5 - 基础扎实
沟通能力: 3/5 - 表达清晰
总体评价: 整体表现不错，建议录用
推荐: 是
面试官: 李面试官
      `.trim();

      emailStore.recordSentEmail({
        messageId: "<orig@mail.example.com>",
        candidateId: "c1",
        positionName: "高级后端工程师",
        resultId: undefined,
      });

      const feedbackId = collector.processFeedbackReply(messageId, "<orig@mail.example.com>", replyText);
      expect(feedbackId).toBeGreaterThan(0);

      const feedbacks = feedbackStore.getByCandidateId("c1");
      expect(feedbacks).toHaveLength(1);
      expect(feedbacks[0].dimensions).toHaveLength(2);
      expect(feedbacks[0].dimensions[0]).toEqual({
        name: "技术能力", rating: 4, comment: "基础扎实",
      });
      expect(feedbacks[0].recommended).toBe(true);
      expect(feedbacks[0].interviewerName).toBe("李面试官");
    });

    it("matches reply to candidate via In-Reply-To header", () => {
      emailStore.recordSentEmail({
        messageId: "<orig2@mail.example.com>",
        candidateId: "c1",
        positionName: "高级后端工程师",
        resultId: undefined,
      });

      const feedbackId = collector.processFeedbackReply(
        "<reply2@mail.example.com>",
        "<orig2@mail.example.com>",
        "技术能力: 5/5\n总体评价: 优秀\n推荐: 是"
      );
      expect(feedbackId).toBeGreaterThan(0);

      const feedbacks = feedbackStore.getByCandidateId("c1");
      expect(feedbacks).toHaveLength(1);
      expect(feedbacks[0].dimensions[0].rating).toBe(5);
    });

    it("returns null for unparseable reply text", () => {
      emailStore.recordSentEmail({
        messageId: "<orig3@mail.example.com>",
        candidateId: "c1",
        positionName: "高级后端工程师",
      });

      const result = collector.processFeedbackReply(
        "<reply3@mail.example.com>",
        "<orig3@mail.example.com>",
        "收到，谢谢"
      );
      expect(result).toBeNull();
    });

    it("returns null when In-Reply-To does not match any sent email", () => {
      const result = collector.processFeedbackReply(
        "<reply4@mail.example.com>",
        "<nonexistent@mail.example.com>",
        "技术能力: 4/5\n总体评价: 好\n推荐: 是"
      );
      expect(result).toBeNull();
    });

    it("records the processed reply for idempotency", () => {
      emailStore.recordSentEmail({
        messageId: "<orig5@mail.example.com>",
        candidateId: "c1",
        positionName: "高级后端工程师",
      });

      const msgId = "<reply5@mail.example.com>";
      collector.processFeedbackReply(msgId, "<orig5@mail.example.com>", "技术能力: 4/5\n总体评价: 好\n推荐: 是");

      expect(emailStore.isReplyProcessed(msgId)).toBe(true);
    });

    it("skips already-processed replies (idempotency)", () => {
      emailStore.recordSentEmail({
        messageId: "<orig6@mail.example.com>",
        candidateId: "c1",
        positionName: "高级后端工程师",
      });

      const msgId = "<reply6@mail.example.com>";
      // First call stores feedback
      collector.processFeedbackReply(msgId, "<orig6@mail.example.com>", "技术能力: 4/5\n总体评价: 好\n推荐: 是");
      // Second call should skip
      const result = collector.processFeedbackReply(msgId, "<orig6@mail.example.com>", "技术能力: 5/5\n总体评价: 优秀\n推荐: 是");

      expect(result).toBeNull(); // Skipped, no new feedback
      const feedbacks = feedbackStore.getByCandidateId("c1");
      expect(feedbacks).toHaveLength(1); // Still only one feedback
    });

    it("uses interviewEventId from the request context when available", () => {
      // Simulate a scenario where the reply references a known event
      emailStore.recordSentEmail({
        messageId: "<orig7@mail.example.com>",
        candidateId: "c1",
        positionName: "高级后端工程师",
        resultId: undefined,
      });

      const feedbackId = collector.processFeedbackReply(
        "<reply7@mail.example.com>",
        "<orig7@mail.example.com>",
        "技术能力: 3/5\n总体评价: 可以考虑\n推荐: 否",
        eventId,
      );
      expect(feedbackId).toBeGreaterThan(0);

      const feedbacks = feedbackStore.getByEventId(eventId);
      expect(feedbacks).toHaveLength(1);
    });
  });
});
