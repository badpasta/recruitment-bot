import type { InterviewFeedbackStore } from "../store/interview-feedback.js";
import type { InterviewEventStore } from "../store/interview-events.js";
import type { EmailStore } from "../store/email-store.js";
import type { CandidateStore } from "../store/candidates.js";
import { parseFeedbackFromText } from "./parser.js";

export interface FeedbackRequestData {
  candidateName: string;
  positionName: string;
  interviewType: string;
  scheduledAt: string;
  candidateId: string;
  eventId: number;
}

/**
 * Build the HTML email body for a feedback request.
 */
export function buildFeedbackRequestHtml(data: FeedbackRequestData): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <h2 style="color: #1a73e8;">面试反馈请求</h2>
  <p>请对以下候选人提供面试反馈：</p>
  <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
    <tr style="background-color: #f5f5f5;">
      <td style="font-weight: bold; width: 120px;">候选人姓名</td>
      <td>${escapeHtml(data.candidateName)}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">应聘职位</td>
      <td>${escapeHtml(data.positionName)}</td>
    </tr>
    <tr style="background-color: #f5f5f5;">
      <td style="font-weight: bold;">面试类型</td>
      <td>${escapeHtml(data.interviewType)}</td>
    </tr>
    <tr>
      <td style="font-weight: bold;">面试时间</td>
      <td>${escapeHtml(data.scheduledAt)}</td>
    </tr>
  </table>

  <h3 style="color: #555; margin-top: 24px;">反馈方式一：回复邮件</h3>
  <p>直接回复此邮件，按以下模板填写反馈：</p>
  <pre style="background: #f8f8f8; border: 1px solid #ddd; padding: 12px; font-size: 13px; line-height: 1.8;">
技术能力: _/5 - 评语
沟通能力: _/5 - 评语
系统设计: _/5 - 评语
团队协作: _/5 - 评语
总体评价: 综合评价
推荐: 是/否
面试官: 姓名</pre>

  <h3 style="color: #555; margin-top: 24px;">反馈方式二：在线表单</h3>
  <p>访问以下链接填写反馈表单：</p>
  <p><a href="https://recruitment-bot.example.com/feedback?event=${data.eventId}&candidate=${escapeHtml(data.candidateId)}" style="color: #1a73e8;">📝 填写反馈表单</a></p>

  <p style="color: #999; font-size: 12px; margin-top: 24px;">
    请在面试结束后24小时内提交反馈。
  </p>
</body>
</html>`.trim();
}

/**
 * Build the email subject for a feedback request.
 */
export function buildFeedbackRequestSubject(data: FeedbackRequestData): string {
  return `[面试反馈请求] ${data.positionName} - ${data.candidateName} (${data.scheduledAt})`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class FeedbackCollector {
  constructor(
    private feedbackStore: InterviewFeedbackStore,
    private eventStore: InterviewEventStore,
    private emailStore: EmailStore,
    private candidateStore: CandidateStore,
  ) {}

  /**
   * Process a feedback reply email.
   * Matches the reply to a sent email via In-Reply-To, parses feedback from the body,
   * and stores it in the interview_feedback table.
   *
   * @param messageId - The Message-ID of the reply email
   * @param inReplyTo - The In-Reply-To header from the reply (references the sent request)
   * @param textBody - The plain text body of the reply email
   * @param eventId - Optional explicit event ID override (if known from context)
   * @returns The inserted feedback ID, or null if parsing/matching fails
   */
  processFeedbackReply(
    messageId: string,
    inReplyTo: string | null,
    textBody: string,
    eventId?: number,
  ): number | null {
    if (this.emailStore.isReplyProcessed(messageId)) {
      return null;
    }

    // Match reply to sent email
    let candidateId: string | undefined;
    if (inReplyTo) {
      const sentEmail = this.emailStore.getSentByMessageId(inReplyTo);
      if (sentEmail) {
        candidateId = sentEmail.candidateId;
      } else {
        return null; // Can't match reply to a candidate
      }
    } else {
      return null; // No In-Reply-To, can't trace
    }

    // Parse feedback from reply body
    const parsed = parseFeedbackFromText(textBody);
    if (!parsed) return null;

    // Record reply for idempotency before storing
    this.emailStore.recordProcessedReply({
      messageId,
      inReplyTo: inReplyTo ?? undefined,
      candidateId,
      action: "feedback",
    });

    // Determine the interview event ID
    let resolvedEventId = eventId;
    if (resolvedEventId === undefined) {
      const candidateEvents = this.eventStore.getByCandidateId(candidateId);
      const completed = candidateEvents
        .filter((e) => e.status === "completed")
        .sort((a, b) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""));
      if (completed.length > 0) {
        resolvedEventId = completed[0].id;
      }
    }

    if (resolvedEventId === undefined) return null;

    const feedbackId = this.feedbackStore.insert({
      interviewEventId: resolvedEventId,
      candidateId,
      dimensions: parsed.dimensions,
      overallComment: parsed.overallComment,
      recommended: parsed.recommended,
      interviewerName: parsed.interviewerName ?? "",
    });

    return feedbackId;
  }
}
