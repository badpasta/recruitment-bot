import { describe, it, expect } from "vitest";
import {
  parseCandidateList,
  parseCandidateDetail,
  type RawCandidateListItem,
  type RawCandidateDetail,
} from "../../src/scraper/boss-zhipin.js";

describe("parseCandidateList", () => {
  const makeRawItem = (overrides: Partial<RawCandidateListItem> = {}): RawCandidateListItem => ({
    name: "张三",
    status: "在职",
    skills: "k8s, docker, CI/CD",
    experienceYears: "3-5年",
    salaryExpectation: "16-18K",
    profileUrl: "https://www.zhipin.com/gongke/abc123.html",
    ...overrides,
  });

  it("parses a basic candidate item", () => {
    const result = parseCandidateList([makeRawItem()]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("张三");
    expect(result[0].id).toBeTruthy();
    expect(result[0].rawProfile.skills).toEqual(["k8s", "docker", "CI/CD"]);
  });

  it("parses multiple candidates", () => {
    const items = [
      makeRawItem({ name: "张三" }),
      makeRawItem({ name: "李四" }),
      makeRawItem({ name: "王五" }),
    ];
    const result = parseCandidateList(items);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.name)).toEqual(["张三", "李四", "王五"]);
  });

  it("handles empty items array", () => {
    const result = parseCandidateList([]);
    expect(result).toEqual([]);
  });

  it("handles empty skills string", () => {
    const result = parseCandidateList([makeRawItem({ skills: "" })]);
    expect(result[0].rawProfile.skills).toEqual([]);
  });

  it("extracts candidate ID from URL", () => {
    const result = parseCandidateList([
      makeRawItem({ profileUrl: "https://www.zhipin.com/gongke/xyz789.html" }),
    ]);
    expect(result[0].id).toBeTruthy();
    expect(typeof result[0].id).toBe("string");
  });
});

describe("parseCandidateDetail", () => {
  const makeRawDetail = (overrides: Partial<RawCandidateDetail> = {}): RawCandidateDetail => ({
    skills: ["k8s", "docker", "helm"],
    workHistory: [
      {
        company: "公司A",
        title: "运维工程师",
        startDate: "2020-01",
        endDate: "至今",
        description: "负责k8s集群运维",
      },
    ],
    projectHistory: [
      {
        name: "项目A",
        description: "CI/CD pipeline搭建",
      },
    ],
    ...overrides,
  });

  it("parses a complete candidate detail", () => {
    const result = parseCandidateDetail(makeRawDetail());
    expect(result.skills).toEqual(["k8s", "docker", "helm"]);
    expect(result.workHistory).toHaveLength(1);
    expect(result.workHistory[0].company).toBe("公司A");
    expect(result.projectHistory).toHaveLength(1);
    expect(result.projectHistory[0].name).toBe("项目A");
  });

  it("parses detail with optional fields", () => {
    const result = parseCandidateDetail(makeRawDetail({
      status: "在职",
      experienceYears: "5年",
      salaryExpectation: "20K",
      selfEvaluation: "热爱技术",
    }));
    expect(result.status).toBe("在职");
    expect(result.experienceYears).toBe(5);
    expect(result.salaryExpectation).toBe(20000);
    expect(result.selfEvaluation).toBe("热爱技术");
  });

  it("handles empty work and project history", () => {
    const result = parseCandidateDetail(makeRawDetail({
      workHistory: [],
      projectHistory: [],
    }));
    expect(result.workHistory).toEqual([]);
    expect(result.projectHistory).toEqual([]);
  });

  it("handles undefined optional fields", () => {
    const result = parseCandidateDetail(makeRawDetail({
      status: undefined,
      experienceYears: undefined,
      salaryExpectation: undefined,
      selfEvaluation: undefined,
    }));
    expect(result.status).toBeUndefined();
    expect(result.experienceYears).toBeUndefined();
    expect(result.salaryExpectation).toBeUndefined();
    expect(result.selfEvaluation).toBeUndefined();
  });
});

describe("parseYearsString (via parseCandidateList)", () => {
  function parseYears(input: string): number | undefined {
    const result = parseCandidateList([
      {
        name: "Test",
        status: "",
        skills: "",
        experienceYears: input,
        salaryExpectation: "",
        profileUrl: "https://www.zhipin.com/gongke/test.html",
      },
    ]);
    return result[0].rawProfile.experienceYears;
  }

  it("parses single year '5年'", () => {
    expect(parseYears("5年")).toBe(5);
  });

  it("parses range '3-5年' as midpoint", () => {
    expect(parseYears("3-5年")).toBe(4);
  });

  it("parses range '5~10年' as midpoint", () => {
    expect(parseYears("5~10年")).toBe(8); // (5+10)/2 rounded = 8
  });

  it("parses '应届' as 0", () => {
    expect(parseYears("应届")).toBe(0);
  });

  it("returns undefined for empty string", () => {
    expect(parseYears("")).toBeUndefined();
  });
});

describe("parseSalaryString (via parseCandidateList)", () => {
  function parseSalary(input: string): number | undefined {
    const result = parseCandidateList([
      {
        name: "Test",
        status: "",
        skills: "",
        experienceYears: "",
        salaryExpectation: input,
        profileUrl: "https://www.zhipin.com/gongke/test.html",
      },
    ]);
    return result[0].rawProfile.salaryExpectation;
  }

  it("parses range '16-18K' as midpoint in yuan", () => {
    expect(parseSalary("16-18K")).toBe(17000);
  });

  it("parses range '20~30K' as midpoint in yuan", () => {
    expect(parseSalary("20~30K")).toBe(25000);
  });

  it("parses single value '15K' in yuan", () => {
    expect(parseSalary("15K")).toBe(15000);
  });

  it("returns undefined for empty string", () => {
    expect(parseSalary("")).toBeUndefined();
  });
});
