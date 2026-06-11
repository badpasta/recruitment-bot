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
    let rawList: RawCandidateListItem[];
    try {
      rawList = await browser.evaluate<RawCandidateListItem[]>(`(() => {
        const items = document.querySelectorAll('.chat-item, .candidate-item, [class*="chat"]');
        return Array.from(items).map(item => ({
          name: item.querySelector('.name, .geek-name')?.textContent?.trim() || '',
          status: item.querySelector('.status, .job-status')?.textContent?.trim() || '',
          skills: item.querySelector('.skills, .tag-list')?.textContent?.trim() || '',
          experienceYears: item.querySelector('.exp, .work-year')?.textContent?.trim() || '',
          salaryExpectation: item.querySelector('.salary, .expect-salary')?.textContent?.trim() || '',
          profileUrl: item.querySelector('a')?.href || '',
        }));
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
        await browser.navigate(candidate.profileUrl);
        await randomDelay(this.options.minDelay, this.options.maxDelay);

        const rawDetail = await browser.evaluate<RawCandidateDetail>(`(() => {
          const skills = Array.from(
            document.querySelectorAll('.skill-tag, .tag-item, [class*="skill"]')
          ).map(el => el.textContent?.trim() || '');
          const workItems = document.querySelectorAll('.work-item, [class*="work-exp"]');
          const workHistory = Array.from(workItems).map(item => ({
            company: item.querySelector('.company')?.textContent?.trim() || '',
            title: item.querySelector('.title, .position')?.textContent?.trim() || '',
            startDate: item.querySelector('.date, .time')?.textContent?.trim() || '',
            endDate: '',
            description: item.querySelector('.desc, .content')?.textContent?.trim() || '',
          }));
          const projectItems = document.querySelectorAll('.project-item, [class*="project"]');
          const projectHistory = Array.from(projectItems).map(item => ({
            name: item.querySelector('.name, .title')?.textContent?.trim() || '',
            description: item.querySelector('.desc, .content')?.textContent?.trim() || '',
          }));
          return {
            skills, workHistory, projectHistory,
            selfEvaluation: document.querySelector('.self-eval, [class*="evaluate"]')?.textContent?.trim() || '',
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

        await browser.navigate(bossUrl);
        await randomDelay(this.options.minDelay, this.options.maxDelay);
      } catch (err) {
        log.error(`Failed to scrape candidate ${candidate.id}: ${err}`);
      }
    }

    log.info(`Scrape round complete. Processed ${results.length} new candidates.`);
    return results;
  }
}
