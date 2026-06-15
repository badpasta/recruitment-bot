import type { EliminationStore } from "../store/elimination.js";
import type { ResultStore } from "../store/results.js";
import type { CandidateStore } from "../store/candidates.js";
import type { PlatformMessenger } from "../types/index.js";
import { pickTemplate, renderTemplate } from "./template.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("elimination");

/**
 * Orchestrates the elimination flow:
 * 1. Query screening_results with status='eliminated'
 * 2. For each: skip if already in elimination_log
 * 3. Pick and render a rejection template
 * 4. Send via PlatformMessenger
 * 5. Record in elimination_log
 */
export class EliminationProcessor {
  constructor(
    private eliminationStore: EliminationStore,
    private resultStore: ResultStore,
    private candidateStore: CandidateStore,
    private messenger: PlatformMessenger,
    private templates: string[],
  ) {}

  async processEliminated(positionName: string): Promise<number> {
    const eliminated = this.resultStore.getByStatus("eliminated");
    const positionEliminated = eliminated.filter((r) => r.positionName === positionName);

    let processed = 0;

    for (const result of positionEliminated) {
      // Skip if already processed
      if (this.eliminationStore.isEliminated(result.candidateId, positionName)) {
        continue;
      }

      // Get candidate info
      const candidate = this.candidateStore.getById(result.candidateId);
      if (!candidate) {
        log.warn(`Cannot find candidate ${result.candidateId}, skipping`);
        continue;
      }

      // Pick and render template
      const template = pickTemplate(this.templates);
      const message = renderTemplate(template, candidate.name);

      // Send rejection message
      const sent = await this.messenger.sendMessage(
        result.candidateId,
        candidate.name,
        message,
      );

      // Record elimination
      this.eliminationStore.insert({
        candidateId: result.candidateId,
        positionName,
        reason: "eliminated",
        templateUsed: template.substring(0, 50),
        platformReplied: sent,
      });

      if (sent) {
        log.info(`✓ Eliminated: ${candidate.name} (message sent)`);
      } else {
        log.warn(`⚠ Eliminated: ${candidate.name} (message failed to send)`);
      }

      processed++;
    }

    if (processed > 0) {
      log.info(`Elimination round: ${processed} candidate(s) processed`);
    }

    return processed;
  }
}
