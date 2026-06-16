import type { EliminationStore } from "../store/elimination.js";
import type { ResultStore } from "../store/results.js";
import type { TemplateLoader } from "./templates.js";
import type { BrowserClient } from "../scraper/browser-client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("eliminator");

export interface EliminatorDeps {
  eliminationStore: EliminationStore;
  resultStore: ResultStore;
  templateLoader: TemplateLoader;
  browser: BrowserClient;
}

export interface EliminateRequest {
  candidateId: string;
  positionName: string;
  reason?: string;
}

export interface EliminateResult {
  skipped: boolean;
  platformReplied: boolean;
  templateUsed: string;
}

const CHAT_INPUT_SELECTOR = "#chat-input";
const CHAT_SEND_SELECTOR = ".btn-send";

export class Eliminator {
  constructor(private deps: EliminatorDeps) {}

  async eliminate(req: EliminateRequest): Promise<EliminateResult> {
    if (this.deps.eliminationStore.isEliminated(req.candidateId)) {
      log.info(
        `Candidate ${req.candidateId} already eliminated — skipping`,
      );
      return {
        skipped: true,
        platformReplied: false,
        templateUsed: "",
      };
    }

    this.deps.resultStore.updateStatus(
      req.candidateId,
      req.positionName,
      "eliminated",
    );

    const template = this.deps.templateLoader.pickRandom();

    let platformReplied = false;
    try {
      const chatUrl = `https://www.zhipin.com/web/chat/${req.candidateId}`;
      await this.deps.browser.navigate(chatUrl);
      await this.deps.browser.type(CHAT_INPUT_SELECTOR, template);
      await this.deps.browser.click(CHAT_SEND_SELECTOR);
      platformReplied = true;
    } catch (err) {
      log.error(
        `Failed to send elimination message for ${req.candidateId}: ${err}`,
      );
      platformReplied = false;
    }

    this.deps.eliminationStore.insert({
      candidateId: req.candidateId,
      positionName: req.positionName,
      reason: req.reason,
      templateUsed: template,
      platformReplied,
    });

    return { skipped: false, platformReplied, templateUsed: template };
  }
}
