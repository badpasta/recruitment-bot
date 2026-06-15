import { resolve } from "path";
import { loadConfig, validateConfig } from "./config/loader.js";
import { initDatabase } from "./store/db.js";
import { CandidateStore } from "./store/candidates.js";
import { ResultStore } from "./store/results.js";
import { RunStateStore } from "./store/run-state.js";
import { EmailLogStore } from "./store/email-log.js";
import { EliminationStore } from "./store/elimination.js";
import { KimiWebBridgeClient } from "./scraper/browser-client.js";
import { Scraper } from "./scraper/index.js";
import { Screener } from "./screener/index.js";
import { Scheduler } from "./scheduler/index.js";
import { EmailSender } from "./email/sender.js";
import { ReplyMonitor } from "./email/monitor.js";
import { NodemailerTransport } from "./email/nodemailer-transport.js";
import { ImapFlowClient } from "./email/imapflow-client.js";
import { EliminationProcessor } from "./elimination/processor.js";
import { BossMessenger } from "./elimination/boss-messenger.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("recruitment-bot");

const CONFIG_PATH = resolve(import.meta.dirname, "..", "config", "screening.yaml");
const DB_PATH = resolve(import.meta.dirname, "..", "data", "recruitment.db");
const WEBBRIDGE_ENDPOINT = process.env.WEBBRIDGE_ENDPOINT ?? "http://127.0.0.1:10086/command";
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS ?? "300000", 10);

async function main(): Promise<void> {
  log.info("Starting recruitment-bot service...");

  const config = loadConfig(CONFIG_PATH);
  validateConfig(config);
  log.info(`Loaded ${config.positions.length} position(s) from config`);

  const db = initDatabase(DB_PATH);
  const candidateStore = new CandidateStore(db);
  const resultStore = new ResultStore(db);
  const runState = new RunStateStore(db);
  const emailLogStore = new EmailLogStore(db);
  const eliminationStore = new EliminationStore(db);

  const browser = new KimiWebBridgeClient(WEBBRIDGE_ENDPOINT);

  const position = config.positions[0];
  const screener = new Screener(position.screening);
  const scraper = new Scraper(candidateStore);

  // Initialize email modules if configured
  const emailPassword = process.env.EMAIL_PASSWORD ?? "";
  let emailSender: EmailSender | null = null;
  let replyMonitor: ReplyMonitor | null = null;

  if (config.email && emailPassword) {
    const transport = new NodemailerTransport(
      config.email.smtpHost,
      config.email.smtpPort,
      config.email.smtpUser,
      emailPassword,
      config.email.fromName,
    );
    emailSender = new EmailSender(
      transport,
      emailLogStore,
      resultStore,
      candidateStore,
      config.email,
    );

    const imapClient = new ImapFlowClient(
      config.email.imapHost,
      config.email.imapPort,
      config.email.imapUser,
      emailPassword,
    );
    replyMonitor = new ReplyMonitor(
      imapClient,
      emailLogStore,
      resultStore,
      config.email,
    );

    log.info("Email modules initialized (SMTP + IMAP)");
  } else if (config.email && !emailPassword) {
    log.warn("EMAIL_PASSWORD not set, email modules disabled");
  }

  // Initialize elimination module
  const eliminationTemplates = config.elimination?.templates ?? [
    "{{name}}您好，感谢您的关注。经过综合评估，该岗位暂时不太匹配，祝您前程似锦！",
  ];
  const bossMessenger = new BossMessenger(browser, position.bossUrl);
  const eliminationProcessor = new EliminationProcessor(
    eliminationStore,
    resultStore,
    candidateStore,
    bossMessenger,
    eliminationTemplates,
  );
  log.info(`Elimination module initialized (${eliminationTemplates.length} template(s))`);

  async function scanRound(): Promise<void> {
    if (runState.get("is_paused") === "true") {
      log.warn("⚠ Service is paused (login expired?). Re-login and set is_paused=false to resume.");
      return;
    }

    try {
      await browser.navigate(position.bossUrl);
    } catch (err) {
      log.error(`⚠ Failed to connect to kimi-webbridge: ${err}`);
      log.error("Make sure kimi-webbridge daemon is running: ~/.kimi-webbridge/bin/kimi-webbridge status");
      return;
    }

    try {
      const candidates = await scraper.scrapeRound(browser, position.bossUrl);

      let passed = 0;
      let rejected = 0;
      for (const candidate of candidates) {
        const result = screener.screen(candidate.id, position.name, candidate.rawProfile);
        resultStore.insert(result);

        if (result.status === "passed") {
          passed++;
          log.info(`✓ PASSED: ${candidate.name} (score: ${result.score})`);
        } else {
          rejected++;
        }
      }

      log.info(`Round summary: ${passed} passed, ${rejected} rejected, ${candidates.length} total`);
      runState.set("last_scan_time", new Date().toISOString());
      runState.set("error_count", "0");
    } catch (err) {
      log.error(`Scan round failed: ${err}`);
      const errorCount = parseInt(runState.get("error_count") ?? "0", 10) + 1;
      runState.set("error_count", String(errorCount));
    }
  }

  async function fullRound(): Promise<void> {
    // 1. Scrape and screen candidates
    await scanRound();

    // 2. Send emails for passed candidates
    if (emailSender) {
      try {
        await emailSender.sendPending(position.name);
      } catch (err) {
        log.error(`Email send round failed: ${err}`);
      }
    }

    // 3. Check for reply emails
    if (replyMonitor) {
      try {
        await replyMonitor.checkReplies();
      } catch (err) {
        log.error(`Reply monitor failed: ${err}`);
      }
    }

    // 4. Process eliminated candidates
    try {
      await eliminationProcessor.processEliminated(position.name);
    } catch (err) {
      log.error(`Elimination processor failed: ${err}`);
    }
  }

  const scheduler = new Scheduler(fullRound, { intervalMs: SCAN_INTERVAL_MS, maxBackoffMs: 1800000 });

  log.info(`Service started, scanning every ${SCAN_INTERVAL_MS / 1000}s...`);
  log.info(`kimi-webbridge endpoint: ${WEBBRIDGE_ENDPOINT}`);
  log.info(`Position: ${position.name}`);

  process.on("SIGINT", () => {
    log.info("Received SIGINT, shutting down...");
    scheduler.stop();
    browser.disconnect();
    db.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    log.info("Received SIGTERM, shutting down...");
    scheduler.stop();
    browser.disconnect();
    db.close();
    process.exit(0);
  });

  await scheduler.start();
}

main().catch((err) => {
  log.error(`Fatal error: ${err}`);
  process.exit(1);
});
