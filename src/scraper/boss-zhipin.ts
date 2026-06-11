import type { Candidate, CandidateProfile, WorkEntry, ProjectEntry } from "../types/index.js";
import { extractCandidateId } from "../utils/anti-detect.js";

export interface RawCandidateListItem {
  name: string;
  status: string;
  skills: string;
  experienceYears: string;
  salaryExpectation: string;
  profileUrl: string;
}

export interface RawCandidateDetail {
  skills: string[];
  workHistory: WorkEntry[];
  projectHistory: ProjectEntry[];
  selfEvaluation?: string;
  status?: string;
  experienceYears?: string;
  salaryExpectation?: string;
}

export function parseCandidateList(items: RawCandidateListItem[]): Candidate[] {
  return items.map((item) => ({
    id: extractCandidateId(item.profileUrl),
    name: item.name,
    profileUrl: item.profileUrl,
    rawProfile: {
      status: item.status,
      skills: parseSkillsString(item.skills),
      experienceYears: parseYearsString(item.experienceYears),
      salaryExpectation: parseSalaryString(item.salaryExpectation),
      workHistory: [],
      projectHistory: [],
    },
  }));
}

export function parseCandidateDetail(detail: RawCandidateDetail): CandidateProfile {
  return {
    skills: detail.skills,
    status: detail.status,
    experienceYears: detail.experienceYears
      ? parseYearsString(detail.experienceYears)
      : undefined,
    salaryExpectation: detail.salaryExpectation
      ? parseSalaryString(detail.salaryExpectation)
      : undefined,
    workHistory: detail.workHistory,
    projectHistory: detail.projectHistory,
    selfEvaluation: detail.selfEvaluation,
  };
}

function parseSkillsString(skills: string): string[] {
  if (!skills) return [];
  return skills
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseYearsString(years: string): number | undefined {
  if (!years) return undefined;
  if (years.includes("应届")) return 0;
  const rangeMatch = years.match(/(\d+)\s*[-~]\s*(\d+)/);
  if (rangeMatch) {
    return Math.round((parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2);
  }
  const singleMatch = years.match(/(\d+)/);
  if (singleMatch) return parseInt(singleMatch[1]);
  return undefined;
}

function parseSalaryString(salary: string): number | undefined {
  if (!salary) return undefined;
  const cleaned = salary.replace(/[^\d\-~Kk]/g, "");
  const rangeMatch = cleaned.match(/(\d+)\s*[-~]\s*(\d+)/i);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1]) * 1000;
    const high = parseInt(rangeMatch[2]) * 1000;
    return Math.round((low + high) / 2);
  }
  const singleMatch = cleaned.match(/(\d+)/);
  if (singleMatch) return parseInt(singleMatch[1]) * 1000;
  return undefined;
}
