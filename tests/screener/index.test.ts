import { describe, it, expect } from "vitest";
import { Screener } from "../../src/screener/index.js";
import type { ScreeningConfig, CandidateProfile } from "../../src/types/index.js";

function makeProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    skills: ["k8s", "docker"],
    experienceYears: 5,
    salaryExpectation: 17000,
    workHistory: [],
    projectHistory: [],
    ...overrides,
  };
}

const config: ScreeningConfig = {
  required: [
    { field: "status", notIn: ["离职", "暂不考虑"] },
    { field: "skills", containsAny: ["k8s", "docker"] },
  ],
  preferred: [
    { field: "skills", containsAny: ["docker"], weight: 10 },
    { field: "skills", containsAny: ["helm"], weight: 8 },
    { field: "experienceYears", min: 3, weight: 10 },
    { field: "salaryExpectation", max: 20000, weight: 5 },
  ],
  passThreshold: 15,
};

describe("Screener", () => {
  describe("screen()", () => {
    it("passes a candidate who meets all required rules and enough preferred weight", () => {
      const screener = new Screener(config);
      const profile = makeProfile({ status: "在职" });
      const result = screener.screen("c1", "运维工程师", profile);

      expect(result.status).toBe("passed");
      expect(result.score).toBeGreaterThan(0);
      expect(result.positionName).toBe("运维工程师");
      expect(result.candidateId).toBe("c1");
    });

    it("rejects when a required rule fails (status in block list)", () => {
      const screener = new Screener(config);
      const profile = makeProfile({ status: "离职" });
      const result = screener.screen("c2", "运维工程师", profile);

      expect(result.status).toBe("rejected");
      expect(result.score).toBe(0);
      expect(result.matchDetails.requiredMatched.some((r) => !r.passed)).toBe(true);
    });

    it("rejects when no required skill keyword matches", () => {
      const screener = new Screener(config);
      const profile = makeProfile({ skills: ["Python", "Go"], status: "在职" });
      const result = screener.screen("c3", "运维工程师", profile);

      expect(result.status).toBe("rejected");
      expect(result.score).toBe(0);
    });

    it("rejects when required rules pass but preferred score is below threshold", () => {
      const screener = new Screener(config);
      // skills match "k8s" (required), but only get docker(10) < threshold(15)
      const profile = makeProfile({
        status: "在职",
        skills: ["k8s"], // no docker, no helm
        experienceYears: 1, // too low for min:3
        salaryExpectation: 25000, // too high for max:20000
      });
      const result = screener.screen("c4", "运维工程师", profile);

      expect(result.status).toBe("rejected");
      expect(result.matchDetails.requiredMatched.every((r) => r.passed)).toBe(true);
      // Only no preferred rule should have passed
      expect(result.score).toBeLessThan(15);
    });

    it("scores correctly with partial preferred matches", () => {
      const screener = new Screener(config);
      // docker=10 + experienceYears(min:3)=10 = 20 >= threshold 15
      const profile = makeProfile({
        status: "在职",
        skills: ["k8s", "docker"],
        experienceYears: 4,
        salaryExpectation: 25000, // over max, so no salary score
      });
      const result = screener.screen("c5", "运维工程师", profile);

      expect(result.status).toBe("passed");
      expect(result.score).toBe(20); // docker(10) + exp(10) = 20
    });

    it("matchDetails includes threshold and totalScore", () => {
      const screener = new Screener(config);
      const profile = makeProfile({ status: "在职" });
      const result = screener.screen("c6", "运维工程师", profile);

      expect(result.matchDetails.threshold).toBe(15);
      expect(typeof result.matchDetails.totalScore).toBe("number");
      expect(Array.isArray(result.matchDetails.requiredMatched)).toBe(true);
      expect(Array.isArray(result.matchDetails.preferredMatched)).toBe(true);
    });
  });

  describe("reload()", () => {
    it("updates config and uses new rules on next screen()", () => {
      const screener = new Screener(config);
      const profile = makeProfile({ status: "在职", skills: ["Python"] });

      // Before reload: "Python" doesn't match required "k8s/docker"
      const before = screener.screen("c7", "运维工程师", profile);
      expect(before.status).toBe("rejected");

      // Reload with a config that accepts "Python"
      const newConfig: ScreeningConfig = {
        required: [{ field: "skills", containsAny: ["Python"] }],
        preferred: [],
        passThreshold: 0,
      };
      screener.reload(newConfig);

      const after = screener.screen("c7", "运维工程师", profile);
      expect(after.status).toBe("passed");
    });
  });
});
