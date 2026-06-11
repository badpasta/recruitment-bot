import { matchRule } from "./matcher.js";
import type {
  ScreeningConfig,
  ScreeningResult,
  ScreeningStatus,
  CandidateProfile,
  MatchDetails,
  RuleMatch,
  PreferredMatch,
} from "../types/index.js";

export class Screener {
  constructor(private config: ScreeningConfig) {}

  screen(candidateId: string, positionName: string, profile: CandidateProfile): ScreeningResult {
    const profileData = profile as unknown as Record<string, unknown>;

    // Phase 1: Check required rules
    const requiredMatched: RuleMatch[] = this.config.required.map((rule) =>
      matchRule(profileData, rule),
    );

    const allRequiredPassed = requiredMatched.every((r) => r.passed);

    if (!allRequiredPassed) {
      return {
        candidateId,
        positionName,
        status: "rejected",
        score: 0,
        matchDetails: {
          requiredMatched,
          preferredMatched: [],
          totalScore: 0,
          threshold: this.config.passThreshold,
        },
      };
    }

    // Phase 2: Score preferred rules
    const preferredMatched: PreferredMatch[] = this.config.preferred.map((rule) => {
      const result = matchRule(profileData, rule);
      return { ...result, weight: rule.weight };
    });

    const totalScore = preferredMatched
      .filter((r) => r.passed)
      .reduce((sum, r) => sum + r.weight, 0);

    const status: ScreeningStatus = totalScore >= this.config.passThreshold ? "passed" : "rejected";

    const matchDetails: MatchDetails = {
      requiredMatched,
      preferredMatched,
      totalScore,
      threshold: this.config.passThreshold,
    };

    return { candidateId, positionName, status, score: totalScore, matchDetails };
  }

  reload(newConfig: ScreeningConfig): void {
    this.config = newConfig;
  }
}
