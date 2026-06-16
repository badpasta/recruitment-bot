import { describe, it, expect } from "vitest";
import { TemplateLoader } from "../../src/eliminator/templates.js";
import { resolve } from "path";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("TemplateLoader", () => {
  describe("load", () => {
    it("loads a valid YAML config and reports correct count", () => {
      const loader = new TemplateLoader(resolve(fixturesDir, "valid-templates.yaml"));
      loader.load();
      expect(loader.count()).toBe(3);
    });

    it("throws ENOENT error when file does not exist", () => {
      const loader = new TemplateLoader(resolve(fixturesDir, "nonexistent.yaml"));
      expect(() => loader.load()).toThrow(/ENOENT/);
    });

    it("throws validation error when templates array is empty", () => {
      const loader = new TemplateLoader(resolve(fixturesDir, "empty-templates.yaml"));
      expect(() => loader.load()).toThrow(/templates/i);
    });

    it("throws validation error when a template item is an empty string", () => {
      const loader = new TemplateLoader(resolve(fixturesDir, "invalid-template-item.yaml"));
      expect(() => loader.load()).toThrow(/templates/i);
    });
  });

  describe("pickRandom", () => {
    it("returns only templates that exist in the loaded list", () => {
      const loader = new TemplateLoader(resolve(fixturesDir, "valid-templates.yaml"));
      loader.load();

      const validTemplates = [
        "感谢您的关注，经过综合评估，该岗位暂时不太匹配，祝您早日找到合适的工作！",
        "您好，感谢您的投递。经过慎重考虑，我们认为目前的岗位方向与您的背景不太契合，祝一切顺利！",
        "感谢应聘，您的履历很优秀，但该岗位需求与您的方向有些偏差，期待未来有机会合作。",
      ];

      for (let i = 0; i < 100; i++) {
        const picked = loader.pickRandom();
        expect(validTemplates).toContain(picked);
      }
    });

    it("produces at least 2 different results over 100 calls (randomness)", () => {
      const loader = new TemplateLoader(resolve(fixturesDir, "valid-templates.yaml"));
      loader.load();

      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(loader.pickRandom());
      }
      expect(results.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("count", () => {
    it("returns the correct number of templates", () => {
      const loader = new TemplateLoader(resolve(fixturesDir, "valid-templates.yaml"));
      loader.load();
      expect(loader.count()).toBe(3);
    });
  });
});
