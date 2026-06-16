import type { BrowserClient } from "../scraper/browser-client.js";
import type { InterviewCandidate, InterviewSlot } from "../types/index.js";
import type { InterviewCandidateStore } from "../store/interview-candidates.js";
import type { InterviewMessageStore } from "../store/interview-messages.js";
import { parseCandidateReply } from "./reply-parser.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("messenger");

export interface MessengerConfig {
  bossChatUrl: string;
  messageTemplate: string;
  replyTimeoutDays: number;
  pollIntervalsMs: number[];
}

export interface MessengerCallbacks {
  onConfirmed(candidate: InterviewCandidate, slot: InterviewSlot): void;
  onDeclined(candidate: InterviewCandidate, reason: string): void;
  onTimeout(candidate: InterviewCandidate): void;
  onError(candidate: InterviewCandidate, error: Error): void;
}

interface PollSession {
  candidateId: string;
  positionName: string;
  slots: InterviewSlot[];
  candidateName: string;
  pollCursor: Date;
  retryStage: number;
  browser: BrowserClient;
}

/**
 * Messenger module: communicates with candidates on Boss直聘 via kimi-webbridge.
 *
 * Architecture: self-driven + callback reporting.
 * Each candidate gets a long browser session (PollSession) until terminal state.
 * Exponential backoff polling: configurable intervals (default 2min → 5min → 15min).
 * Message dedup via timestamp cursor.
 */
export class Messenger {
  private sessions = new Map<string, PollSession>();
  private callbacks: MessengerCallbacks | null = null;
  private config: MessengerConfig;

  constructor(
    private browser: BrowserClient,
    private messageStore: InterviewMessageStore,
    private candidateStore: InterviewCandidateStore,
    config: MessengerConfig,
  ) {
    this.config = config;
  }

  setCallbacks(callbacks: MessengerCallbacks): void {
    this.callbacks = callbacks;
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }

  async sendMessage(
    candidate: InterviewCandidate,
    candidateName: string,
    slots: InterviewSlot[],
  ): Promise<void> {
    const key = this.sessionKey(candidate.candidateId, candidate.positionName);
    if (this.sessions.has(key)) {
      throw new Error(`Poll session already active for ${candidateName} (${key})`);
    }

    const message = this.fillTemplate(candidateName, slots);
    log.info(`Sending message to ${candidateName} for ${candidate.positionName}`);

    try {
      await this.browser.navigate(this.config.bossChatUrl);
      await this.browser.evaluate(`sendChatMessage(${JSON.stringify(message)})`);
    } catch (err) {
      log.error(`Failed to send message to ${candidateName}: ${err}`);
      throw err;
    }

    this.messageStore.insert({
      candidateId: candidate.candidateId,
      positionName: candidate.positionName,
      direction: "sent",
      content: message,
    });

    const session: PollSession = {
      candidateId: candidate.candidateId,
      positionName: candidate.positionName,
      slots,
      candidateName,
      pollCursor: new Date(),
      retryStage: 0,
      browser: this.browser,
    };

    this.sessions.set(key, session);
    log.info(
      `Poll session started for ${candidateName}, ` +
      `retry stage 0/${this.config.pollIntervalsMs.length}`,
    );
  }

  async pollReplies(): Promise<void> {
    const sessions = [...this.sessions.entries()];
    for (const [key, session] of sessions) {
      try {
        await this.pollSession(key, session);
      } catch (err) {
        log.error(`Error polling session ${key}: ${err}`);
        if (this.callbacks) {
          const candidate = this.makeCandidateRef(session);
          this.callbacks.onError(
            candidate,
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    for (const [, session] of this.sessions) {
      try {
        await session.browser.disconnect();
      } catch (err) {
        log.warn(`Error disconnecting session for ${session.candidateName}: ${err}`);
      }
    }
    this.sessions.clear();
  }

  private sessionKey(candidateId: string, positionName: string): string {
    return `${candidateId}::${positionName}`;
  }

  private makeCandidateRef(session: PollSession): InterviewCandidate {
    return {
      candidateId: session.candidateId,
      positionName: session.positionName,
      scheduleStatus: "waiting_time",
    };
  }

  private fillTemplate(name: string, slots: InterviewSlot[]): string {
    const slotLines = slots.map((s, i) => `${i + 1}. ${s.label}`).join("\n");
    return this.config.messageTemplate
      .replace(/\{name\}/g, name)
      .replace(/\{slots\}/g, slotLines);
  }

  private async pollSession(key: string, session: PollSession): Promise<void> {
    const messages = await session.browser.evaluate<
      Array<{ text: string; isMine: boolean; time: string }>
    >("extractChatMessages()");

    if (!messages || !Array.isArray(messages)) {
      log.warn(`No messages returned from browser for ${session.candidateName}`);
      return;
    }

    const newMessages = messages.filter((m) => {
      if (m.isMine) return false;
      const msgTime = new Date(m.time);
      return msgTime > session.pollCursor;
    });

    if (newMessages.length === 0) {
      session.retryStage++;
      log.info(
        `No new messages for ${session.candidateName}, ` +
        `retry stage ${session.retryStage}/${this.config.pollIntervalsMs.length}`,
      );

      if (session.retryStage >= this.config.pollIntervalsMs.length + 1) {
        await this.endSession(key, session, "timeout");
      }
      return;
    }

    const latestMsg = newMessages[newMessages.length - 1];
    session.pollCursor = new Date(latestMsg.time);

    this.messageStore.insert({
      candidateId: session.candidateId,
      positionName: session.positionName,
      direction: "received",
      content: latestMsg.text,
    });

    const parsed = parseCandidateReply(latestMsg.text, session.slots);

    switch (parsed.type) {
      case "slot_selected": {
        const slot = session.slots[parsed.selectedSlotIndex!];
        log.info(
          `${session.candidateName} selected slot ${parsed.selectedSlotIndex! + 1}: ${slot.label}`,
        );
        if (this.callbacks) {
          this.callbacks.onConfirmed(this.makeCandidateRef(session), slot);
        }
        await this.endSession(key, session, "confirmed");
        break;
      }
      case "declined": {
        log.info(`${session.candidateName} declined the interview`);
        if (this.callbacks) {
          this.callbacks.onDeclined(this.makeCandidateRef(session), latestMsg.text);
        }
        await this.endSession(key, session, "declined");
        break;
      }
      case "custom_time": {
        const customSlot: InterviewSlot = {
          startTime: "",
          endTime: "",
          label: parsed.customTime || latestMsg.text,
          available: true,
        };
        log.info(`${session.candidateName} proposed a custom time: ${customSlot.label}`);
        if (this.callbacks) {
          this.callbacks.onConfirmed(this.makeCandidateRef(session), customSlot);
        }
        await this.endSession(key, session, "confirmed");
        break;
      }
      default:
        log.info(
          `Unparseable reply from ${session.candidateName}: ` +
          `"${latestMsg.text}" — waiting for next poll`,
        );
        break;
    }
  }

  private async endSession(
    key: string,
    session: PollSession,
    reason: "confirmed" | "declined" | "timeout",
  ): Promise<void> {
    if (reason === "timeout" && this.callbacks) {
      this.callbacks.onTimeout(this.makeCandidateRef(session));
    }

    try {
      await session.browser.disconnect();
    } catch (err) {
      log.warn(`Error closing browser for ${session.candidateName}: ${err}`);
    }

    this.sessions.delete(key);
    log.info(`Poll session ended for ${session.candidateName}: ${reason}`);
  }
}
