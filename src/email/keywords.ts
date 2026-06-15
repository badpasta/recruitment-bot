/**
 * Detect action keywords in email reply text.
 * Returns the matched category name, or "none" if no match.
 * Priority order: interview > eliminated
 */
export function detectKeyword(
  body: string,
  keywords: Record<string, string[]>,
): string {
  if (!body) return "none";

  const lowerBody = body.toLowerCase();

  // Check interview keywords first (higher priority)
  for (const kw of keywords.interview || []) {
    if (lowerBody.includes(kw.toLowerCase())) {
      return "interview";
    }
  }

  // Check eliminated keywords
  for (const kw of keywords.eliminated || []) {
    if (lowerBody.includes(kw.toLowerCase())) {
      return "eliminated";
    }
  }

  return "none";
}
