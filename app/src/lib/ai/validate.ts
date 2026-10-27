// Model output is untrusted input. Everything an agent takes from a model goes through here.

/** Parse a JSON object from model text (tolerates a ```json fence). Returns null if it is not one. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const v: unknown = JSON.parse(t);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A trimmed single string without control characters, or null when empty / too long to trust. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return s.length > 0 && s.length <= max ? s : null;
}

export function cleanList(v: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(v) || v.length > maxItems) return null;
  const out: string[] = [];
  for (const x of v) {
    const s = cleanText(x, maxLen);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/** Every rupee amount mentioned in a text. */
export function rupeeAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?<![A-Za-z])(?:₹|Rs\.?|INR)\s*(\d[\d,]*(?:\.\d+)?)/gi)) out.push(Number(m[1].replace(/,/g, "")));
  return out;
}

/**
 * Agents never calculate money. A model sentence may only mention amounts that the deterministic
 * calculation produced (or that the worker typed); anything else makes the text unusable.
 */
export function moneyIsGrounded(text: string, allowed: number[]): boolean {
  return rupeeAmounts(text).every((a) => allowed.some((x) => Math.abs(x - a) < 0.01));
}

const DECISION_CLAIM = /\b(has been|have been|is now|was)\s+(approved|paid|resolved|rejected|closed|credited)\b/i;
/** Text must not claim that a decision was made: only the backend lifecycle makes decisions. */
export const claimsDecision = (text: string) => DECISION_CLAIM.test(text);
