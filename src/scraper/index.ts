import type { BrowserClient } from "./browser-client.js";
import { parseCandidateList, parseCandidateDetail, type RawCandidateListItem, type RawCandidateDetail } from "./boss-zhipin.js";
import type { CandidateStore } from "../store/candidates.js";
import { randomDelay } from "../utils/anti-detect.js";
import { createLogger } from "../utils/logger.js";
import type { Candidate } from "../types/index.js";

const log = createLogger("scraper");

export interface ScraperOptions {
  maxPerRound: number;
  minDelay: number;
  maxDelay: number;
}

const DEFAULT_OPTIONS: ScraperOptions = {
  maxPerRound: 20,
  minDelay: 2000,
  maxDelay: 5000,
};

export class Scraper {
  private options: ScraperOptions;

  constructor(
    private candidateStore: CandidateStore,
    options?: Partial<ScraperOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  filterNew(candidateIds: string[], existsFn: (id: string) => boolean): string[] {
    const newIds: string[] = [];
    for (const id of candidateIds) {
      if (newIds.length >= this.options.maxPerRound) break;
      if (!existsFn(id)) {
        newIds.push(id);
      }
    }
    return newIds;
  }

  async scrapeRound(browser: BrowserClient, bossUrl: string): Promise<Candidate[]> {
    log.info(`Starting scrape round for ${bossUrl}`);

    await browser.navigate(bossUrl);
    await randomDelay(this.options.minDelay, this.options.maxDelay);

    // Extract candidate list via JS evaluation in the browser
    // Boss直聘 chat page structure: .geek-item-wrap > .geek-item (with data-id)
    // Each item contains: .geek-name, .source-job (position), .time, .push-text (last msg)
    let rawList: RawCandidateListItem[];
    try {
      rawList = await browser.evaluate<RawCandidateListItem[]>(`(() => {
        const items = document.querySelectorAll('.geek-item');
        return Array.from(items).map(item => {
          const sourceJob = item.querySelector('.source-job')?.textContent?.trim() || '';
          const grayStatus = item.querySelector('.gray')?.textContent?.trim() || '';
          const status = [sourceJob, grayStatus].filter(Boolean).join(' | ');
          return {
            name: item.querySelector('.geek-name')?.textContent?.trim() || '',
            status,
            skills: '',
            experienceYears: '',
            salaryExpectation: '',
            profileUrl: '',
            candidateId: item.getAttribute('data-id') || '',
          };
        });
      })()`);
    } catch (err) {
      log.error(`Failed to evaluate candidate list: ${err}`);
      return [];
    }
    const candidates = parseCandidateList(rawList);
    log.info(`Found ${candidates.length} candidates on page`);

    const newIds = this.filterNew(
      candidates.map((c) => c.id),
      (id) => this.candidateStore.exists(id),
    );
    log.info(`${newIds.length} new candidates to process (skipped ${candidates.length - newIds.length} already-processed)`);

    const newCandidates = candidates.filter((c) => newIds.includes(c.id));
    const results: Candidate[] = [];

    for (const candidate of newCandidates) {
      try {
        // Click on the candidate in the chat list to open their conversation
        // Use JS click via evaluate for reliability (kimi-webbridge click() can fail on Vue components)
        const escapedId = candidate.id.replace(/"/g, '\\"');
        const clickResult = await browser.evaluate<string>(`(() => {
          const item = document.querySelector('.geek-item[data-id="${escapedId}"]');
          if (!item) return 'not_found';
          item.scrollIntoView({behavior: 'instant', block: 'center'});
          item.click();
          return 'clicked';
        })()`);
        if (clickResult === "not_found") {
          log.warn(`Candidate ${candidate.id} not found in DOM, skipping`);
          continue;
        }
        await randomDelay(this.options.minDelay, this.options.maxDelay);

        // Extract detail info from the chat sidebar (right panel)
        const rawDetail = await browser.evaluate<RawCandidateDetail>(`(() => {
          const baseInfo = document.querySelector('.base-info-single-container');
          if (!baseInfo) return { skills: [], workHistory: [], projectHistory: [] };

          // Parse time + content pairs from the experience section
          const timeEls = baseInfo.querySelectorAll('.time-content .time, .experience-content .time');
          const contentEls = baseInfo.querySelectorAll('.detail-list .value, .detail-list .work-content');
          const workHistory = [];
          const times = Array.from(timeEls).map(el => el.textContent?.trim() || '');
          const contents = Array.from(contentEls).map(el => el.textContent?.trim() || '');

          for (let i = 0; i < contents.length; i++) {
            const text = contents[i];
            const date = times[i] || '';
            // Work entries have "company · title" pattern
            // Education entries have "school · major · degree" pattern
            const parts = text.split('·').map(s => s.trim());
            if (parts.length >= 2) {
              // Heuristic: if it looks like education (has degree keywords), skip for workHistory
              const isEdu = /硕士|博士|本科|大专|学士|MBA|EMBA/.test(text);
              if (!isEdu) {
                workHistory.push({
                  company: parts[0] || '',
                  title: parts[1] || '',
                  startDate: date,
                  endDate: '',
                  description: '',
                });
              }
            }
          }

          // Extract salary expectation from sidebar text
          const slideText = baseInfo.querySelector('.slide-content-click-content, .base-info-single-main')?.textContent || '';
          const salaryMatch = slideText.match(/(\\d+)\\s*[-~]\\s*(\\d+)\\s*[Kk]/);
          const salaryExpectation = salaryMatch
            ? salaryMatch[0]
            : '';

          // Extract expected position
          const expectMatch = slideText.match(/期望[：:]\\s*([^\\d]+?)\\s*(\\d|$)/);

          return {
            skills: [],
            workHistory,
            projectHistory: [],
            selfEvaluation: '',
            salaryExpectation: salaryExpectation,
            experienceYears: '',
          };
        })()`);

        const detail = parseCandidateDetail(rawDetail);
        const enriched: Candidate = {
          ...candidate,
          rawProfile: { ...candidate.rawProfile, ...detail },
        };

        this.candidateStore.upsert(enriched);
        results.push(enriched);
        log.info(`Scraped: ${enriched.name} (${enriched.id})`);

        await randomDelay(this.options.minDelay, this.options.maxDelay);
      } catch (err) {
        log.error(`Failed to scrape candidate ${candidate.id}: ${err}`);
      }
    }

    log.info(`Scrape round complete. Processed ${results.length} new candidates.`);
    return results;
  }
}
