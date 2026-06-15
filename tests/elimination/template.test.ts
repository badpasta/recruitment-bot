import { describe, it, expect } from "vitest";
import { pickTemplate, renderTemplate } from "../../src/elimination/template.js";

describe("Elimination Template", () => {
  describe("pickTemplate", () => {
    it("returns a template from the list", () => {
      const templates = ["模板A", "模板B", "模板C"];
      const picked = pickTemplate(templates);
      expect(templates).toContain(picked);
    });

    it("returns the only template when list has one", () => {
      const templates = ["唯一的模板"];
      expect(pickTemplate(templates)).toBe("唯一的模板");
    });

    it("throws when templates list is empty", () => {
      expect(() => pickTemplate([])).toThrow("No elimination templates configured");
    });
  });

  describe("renderTemplate", () => {
    it("replaces {{name}} placeholder with candidate name", () => {
      const template = "感谢{{name}}的关注，经过综合评估，该岗位暂时不太匹配。";
      const result = renderTemplate(template, "张三");
      expect(result).toBe("感谢张三的关注，经过综合评估，该岗位暂时不太匹配。");
    });

    it("replaces multiple {{name}} occurrences", () => {
      const template = "{{name}}你好，感谢{{name}}的关注。";
      const result = renderTemplate(template, "李四");
      expect(result).toBe("李四你好，感谢李四的关注。");
    });

    it("handles template with no placeholders", () => {
      const template = "感谢您的关注，祝您前程似锦。";
      const result = renderTemplate(template, "张三");
      expect(result).toBe("感谢您的关注，祝您前程似锦。");
    });
  });
});
