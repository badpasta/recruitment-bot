import type { FeedbackDimension } from "../types/index.js";

export interface ParsedFeedback {
  dimensions: FeedbackDimension[];
  overallComment: string;
  recommended: boolean;
  interviewerName?: string;
}

const POSITIVE_REC = /^(是|推荐|yes|通过)$/i;
const NEGATIVE_REC = /^(否|不推荐|no|不通过)$/i;

const DIMENSION_LINE = /^(.+?):\s*(\d+)(?:\s*\/\s*5)?(?:\s*分)?(?:\s*[-–—]\s*(.+))?\s*$/;

const OVERALL_LINE = /^总体评价[：:]\s*(.*)$/;
const RECOMMEND_LINE = /^推荐[：:]\s*(.*)$/;
const INTERVIEWER_LINE = /^面试官[：:]\s*(.*)$/;

/**
 * Parse a structured feedback reply email body into ParsedFeedback.
 * Returns null if no dimension ratings are found.
 */
export function parseFeedbackFromText(text: string): ParsedFeedback | null {
  if (!text || !text.trim()) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const dimensions: FeedbackDimension[] = [];
  const overallLines: string[] = [];
  let recommended = false;
  let interviewerName: string | undefined;
  let inOverall = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inOverall) overallLines.push("");
      continue;
    }

    // Check for fixed fields first
    const recMatch = line.match(RECOMMEND_LINE);
    if (recMatch) {
      inOverall = false;
      const val = recMatch[1].trim();
      if (POSITIVE_REC.test(val)) recommended = true;
      else if (NEGATIVE_REC.test(val)) recommended = false;
      continue;
    }

    const intMatch = line.match(INTERVIEWER_LINE);
    if (intMatch) {
      inOverall = false;
      interviewerName = intMatch[1].trim() || undefined;
      continue;
    }

    const overallMatch = line.match(OVERALL_LINE);
    if (overallMatch) {
      inOverall = true;
      overallLines.push(overallMatch[1].trim());
      continue;
    }

    if (inOverall) {
      // Still collecting overall comment lines
      overallLines.push(line);
      continue;
    }

    // Try dimension line
    const dimMatch = line.match(DIMENSION_LINE);
    if (dimMatch) {
      const name = dimMatch[1].trim();
      const rating = clampRating(parseInt(dimMatch[2], 10));
      const comment = dimMatch[3]?.trim();
      dimensions.push(comment ? { name, rating, comment } : { name, rating });
    }
  }

  if (dimensions.length === 0) return null;

  const overallComment = overallLines.join("\n").trim();

  return {
    dimensions,
    overallComment,
    recommended,
    interviewerName,
  };
}

function clampRating(r: number): number {
  if (Number.isNaN(r)) return 3;
  return Math.max(1, Math.min(5, r));
}
