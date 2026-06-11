/**
 * Sleep for a random duration between minMs and maxMs.
 */
export function randomDelay(minMs: number = 2000, maxMs: number = 5000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Extract a unique candidate identifier from a Boss直聘 URL.
 * Tries geek_card query param first, then path segments, then falls back to URL hash.
 */
export function extractCandidateId(url: string): string {
  try {
    const parsed = new URL(url);

    // Try geek_card query parameter
    const geekCard = parsed.searchParams.get("geek_card");
    if (geekCard) return geekCard;

    // Try to extract ID-like segment from path
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    for (const part of pathParts) {
      const cleaned = part.replace(/\.(html|htm)$/, "");
      if (/^[a-zA-Z0-9_-]{6,}$/.test(cleaned) && !["web", "geek", "gongsi", "gongke", "job", "card", "recommend"].includes(cleaned)) {
        return cleaned;
      }
    }
  } catch {
    // Not a valid URL, fall through to hash
  }

  // Deterministic fallback: simple hash of the URL
  return simpleHash(url);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `fallback_${Math.abs(hash).toString(36)}`;
}
