import { describe, it, expect } from "vitest";
import { matchRule } from "../../src/screener/matcher.js";
import type { RequiredRule } from "../../src/types/index.js";

describe("matchRule", () => {
  describe("containsAny", () => {
    const rule: RequiredRule = { field: "skills", containsAny: ["k8s", "docker"] };

    it("passes when at least one keyword matches (case-insensitive)", () => {
      const result = matchRule({ skills: ["K8s", "Python"] }, rule);
      expect(result.passed).toBe(true);
      expect(result.matched).toEqual(["k8s"]);
    });

    it("passes with multiple keyword matches", () => {
      const result = matchRule({ skills: ["k8s", "Docker", "Python"] }, rule);
      expect(result.passed).toBe(true);
      expect(result.matched).toEqual(["k8s", "docker"]);
    });

    it("fails when no keywords match", () => {
      const result = matchRule({ skills: ["Python", "Go"] }, rule);
      expect(result.passed).toBe(false);
      expect(result.matched).toEqual([]);
    });

    it("handles string field values (not array)", () => {
      const result = matchRule({ skills: "k8s docker python" }, rule);
      expect(result.passed).toBe(true);
      expect(result.matched).toEqual(["k8s", "docker"]);
    });

    it("fails on empty array", () => {
      const result = matchRule({ skills: [] }, rule);
      expect(result.passed).toBe(false);
    });
  });

  describe("containsAll", () => {
    const rule: RequiredRule = { field: "skills", containsAll: ["k8s", "docker"] };

    it("passes only when all keywords match", () => {
      const result = matchRule({ skills: ["k8s", "docker", "python"] }, rule);
      expect(result.passed).toBe(true);
      expect(result.matched).toEqual(["k8s", "docker"]);
    });

    it("fails when only some keywords match", () => {
      const result = matchRule({ skills: ["k8s", "python"] }, rule);
      expect(result.passed).toBe(false);
      expect(result.matched).toEqual(["k8s"]);
    });

    it("fails when no keywords match", () => {
      const result = matchRule({ skills: ["python", "go"] }, rule);
      expect(result.passed).toBe(false);
      expect(result.matched).toEqual([]);
    });

    it("case-insensitive substring matching", () => {
      const result = matchRule({ skills: ["Kubernetes", "Docker CE"] }, rule);
      expect(result.passed).toBe(false); // "k8s" not found in "Kubernetes"
    });
  });

  describe("notIn", () => {
    const rule: RequiredRule = { field: "status", notIn: ["离职", "暂不考虑"] };

    it("passes when value is not in the list", () => {
      const result = matchRule({ status: "在职" }, rule);
      expect(result.passed).toBe(true);
    });

    it("fails when value is in the list", () => {
      const result = matchRule({ status: "离职" }, rule);
      expect(result.passed).toBe(false);
    });

    it("fails when value is null/undefined", () => {
      const result = matchRule({ status: null }, rule);
      expect(result.passed).toBe(false);
    });

    it("case-insensitive comparison", () => {
      const rule2: RequiredRule = { field: "status", notIn: ["rejected"] };
      const result = matchRule({ status: "Rejected" }, rule2);
      expect(result.passed).toBe(false);
    });
  });

  describe("in", () => {
    const rule: RequiredRule = { field: "education", in: ["本科", "硕士", "博士"] };

    it("passes when value is in the list", () => {
      const result = matchRule({ education: "本科" }, rule);
      expect(result.passed).toBe(true);
      expect(result.matched).toEqual(["本科"]);
    });

    it("fails when value is not in the list", () => {
      const result = matchRule({ education: "大专" }, rule);
      expect(result.passed).toBe(false);
      expect(result.matched).toEqual([]);
    });

    it("fails when value is null/undefined", () => {
      const result = matchRule({ education: undefined }, rule);
      expect(result.passed).toBe(false);
    });
  });

  describe("min/max range", () => {
    const rule: RequiredRule = { field: "experienceYears", min: 3, max: 8 };

    it("passes when value is within range", () => {
      const result = matchRule({ experienceYears: 5 }, rule);
      expect(result.passed).toBe(true);
    });

    it("passes at exact min boundary", () => {
      const result = matchRule({ experienceYears: 3 }, rule);
      expect(result.passed).toBe(true);
    });

    it("passes at exact max boundary", () => {
      const result = matchRule({ experienceYears: 8 }, rule);
      expect(result.passed).toBe(true);
    });

    it("fails when value is below min", () => {
      const result = matchRule({ experienceYears: 2 }, rule);
      expect(result.passed).toBe(false);
    });

    it("fails when value is above max", () => {
      const result = matchRule({ experienceYears: 10 }, rule);
      expect(result.passed).toBe(false);
    });

    it("fails when value is NaN", () => {
      const result = matchRule({ experienceYears: "abc" }, rule);
      expect(result.passed).toBe(false);
    });

    it("handles min-only (no max)", () => {
      const rule2: RequiredRule = { field: "experienceYears", min: 3 };
      const result = matchRule({ experienceYears: 100 }, rule2);
      expect(result.passed).toBe(true);
    });

    it("handles max-only (no min)", () => {
      const rule2: RequiredRule = { field: "experienceYears", max: 5 };
      const result = matchRule({ experienceYears: 0 }, rule2);
      expect(result.passed).toBe(true);
    });
  });

  describe("unknown rule type", () => {
    it("returns passed: false for unrecognized rule", () => {
      const rule: RequiredRule = { field: "skills" };
      const result = matchRule({ skills: ["k8s"] }, rule);
      expect(result.passed).toBe(false);
      expect(result.rule).toBe("unknown");
    });
  });
});
