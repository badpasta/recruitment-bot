import type { RequiredRule, RuleMatch } from "../types/index.js";

interface ProfileData {
  [key: string]: unknown;
}

function containsInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Match a single rule against a candidate's profile data.
 */
export function matchRule(profile: ProfileData, rule: RequiredRule): RuleMatch {
  const field = rule.field;
  const value = profile[field];

  if (rule.containsAny) {
    const matched: string[] = [];
    const searchIn = Array.isArray(value)
      ? value.map(String).join(" ")
      : String(value ?? "");

    for (const keyword of rule.containsAny) {
      if (containsInsensitive(searchIn, keyword)) {
        matched.push(keyword);
      }
    }
    return { field, rule: "contains_any", matched, passed: matched.length > 0 };
  }

  if (rule.containsAll) {
    const searchIn = Array.isArray(value)
      ? value.map(String).join(" ")
      : String(value ?? "");

    const matched: string[] = [];
    for (const keyword of rule.containsAll) {
      if (containsInsensitive(searchIn, keyword)) {
        matched.push(keyword);
      }
    }
    return { field, rule: "contains_all", matched, passed: matched.length === rule.containsAll.length };
  }

  if (rule.notIn) {
    if (value === undefined || value === null) {
      return { field, rule: "not_in", passed: false };
    }
    const strValue = String(value).toLowerCase();
    const inList = rule.notIn.some((item) => strValue === item.toLowerCase());
    return { field, rule: "not_in", passed: !inList };
  }

  if (rule.in) {
    if (value === undefined || value === null) {
      return { field, rule: "in", passed: false };
    }
    const strValue = String(value).toLowerCase();
    const inList = rule.in.some((item) => strValue === item.toLowerCase());
    return { field, rule: "in", matched: inList ? [String(value)] : [], passed: inList };
  }

  if (rule.min !== undefined || rule.max !== undefined) {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      return { field, rule: "range", passed: false };
    }
    const aboveMin = rule.min === undefined || numValue >= rule.min;
    const belowMax = rule.max === undefined || numValue <= rule.max;
    return { field, rule: "range", passed: aboveMin && belowMax };
  }

  return { field, rule: "unknown", passed: false };
}
