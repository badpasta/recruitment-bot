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
  ) {
    this.currentInterval = options.intervalMs;
  }

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

    await this.executeRound();
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
