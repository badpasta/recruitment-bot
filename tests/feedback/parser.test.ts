import { describe, it, expect } from "vitest";
import { parseFeedbackFromText } from "../../src/feedback/parser.js";

describe("FeedbackParser", () => {
  describe("parseFeedbackFromText", () => {
    it("parses a complete structured reply with all dimensions", () => {
      const text = `
技术能力: 4/5 - 基础扎实，对分布式系统理解深入
沟通能力: 3/5 - 表达清晰但偶尔跑题
系统设计: 5/5 - 方案合理，考虑周全
总体评价: 候选人整体表现不错，建议录用
推荐: 是
面试官: 李面试官
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.dimensions).toHaveLength(3);
      expect(result!.dimensions[0]).toEqual({
        name: "技术能力",
        rating: 4,
        comment: "基础扎实，对分布式系统理解深入",
      });
      expect(result!.dimensions[1]).toEqual({
        name: "沟通能力",
        rating: 3,
        comment: "表达清晰但偶尔跑题",
      });
      expect(result!.dimensions[2]).toEqual({
        name: "系统设计",
        rating: 5,
        comment: "方案合理，考虑周全",
      });
      expect(result!.overallComment).toBe("候选人整体表现不错，建议录用");
      expect(result!.recommended).toBe(true);
      expect(result!.interviewerName).toBe("李面试官");
    });

    it("parses dimensions without comments", () => {
      const text = `
技术能力: 4/5
沟通能力: 3/5
总体评价: 一般
推荐: 否
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.dimensions).toHaveLength(2);
      expect(result!.dimensions[0]).toEqual({ name: "技术能力", rating: 4 });
      expect(result!.dimensions[1]).toEqual({ name: "沟通能力", rating: 3 });
      expect(result!.recommended).toBe(false);
    });

    it("parses recommendation variations", () => {
      const yesCases = ["是", "推荐", "yes", "Yes", "通过"];
      for (const rec of yesCases) {
        const r = parseFeedbackFromText(`技术能力: 4/5\n推荐: ${rec}`);
        expect(r!.recommended).toBe(true);
      }

      const noCases = ["否", "不推荐", "no", "No", "不通过"];
      for (const rec of noCases) {
        const r = parseFeedbackFromText(`技术能力: 2/5\n推荐: ${rec}`);
        expect(r!.recommended).toBe(false);
      }
    });

    it("defaults to not recommended when recommendation field is missing", () => {
      const text = `
技术能力: 4/5
总体评价: 还行
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.recommended).toBe(false);
    });

    it("returns null for empty text", () => {
      expect(parseFeedbackFromText("")).toBeNull();
      expect(parseFeedbackFromText("   \n  ")).toBeNull();
    });

    it("returns null for text without any dimension ratings", () => {
      expect(parseFeedbackFromText("这是一个普通的回复邮件")).toBeNull();
    });

    it("handles rating format without fraction (e.g. '4分')", () => {
      const text = `
技术能力: 4分 - 很好
总体评价: 不错
推荐: 是
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.dimensions[0].rating).toBe(4);
    });

    it("handles plain number ratings", () => {
      const text = `
技术能力: 4 - 不错
总体评价: ok
推荐: 是
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.dimensions[0].rating).toBe(4);
    });

    it("clamps rating to 1-5 range", () => {
      const text = `
技术能力: 10/5 - 太好了
总体评价: 非常好
推荐: 是
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.dimensions[0].rating).toBe(5);
    });

    it("handles multi-line overall comment", () => {
      const text = `
技术能力: 4/5
总体评价: 候选人表现很好
尤其在系统设计方面非常突出
推荐: 是
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.overallComment).toContain("尤其在系统设计方面非常突出");
    });

    it("extracts interviewer name when present", () => {
      const text = `
技术能力: 4/5
总体评价: 不错
推荐: 是
面试官: 王经理
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.interviewerName).toBe("王经理");
    });

    it("handles Windows-style line endings (CRLF)", () => {
      const text = "技术能力: 4/5\r\n沟通能力: 3/5\r\n总体评价: 还行\r\n推荐: 是";

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.dimensions).toHaveLength(2);
    });

    it("handles dimension names with special characters", () => {
      const text = `
C++/Rust能力: 4/5 - 对内存管理理解深入
团队协作(跨部门): 3/5
总体评价: 不错
推荐: 是
      `.trim();

      const result = parseFeedbackFromText(text);
      expect(result).not.toBeNull();
      expect(result!.dimensions[0].name).toBe("C++/Rust能力");
      expect(result!.dimensions[1].name).toBe("团队协作(跨部门)");
    });
  });
});
