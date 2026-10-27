import { NextResponse } from "next/server";
import { hydrate, persist } from "./persist";
import { clientKey, fail, HttpError, isIndustry, rateLimit, readJson, safeEqual } from "./http";
import { DomainError } from "./errors";
import type { IndustryId } from "./types";

// Demo-grade employer gate: a shared PIN from EMPLOYER_PIN. The "1234" default exists only outside
// production; in production with no EMPLOYER_PIN, employer access is closed rather than guessable.
// Replace with Supabase Auth + row-level security for production.
const PIN = process.env.EMPLOYER_PIN || (process.env.NODE_ENV === "production" ? "" : "1234");

/** True when the request carries the right PIN. Wrong guesses are throttled per caller. */
export function isEmployer(req: Request) {
  const given = req.headers.get("x-employer-pin");
  if (!given || !PIN) return false;
  if (safeEqual(given, PIN)) return true;
  rateLimit(`pin:${clientKey(req)}`, 10, 60_000);
  return false;
}

export function requireEmployer(req: Request) {
  if (!isEmployer(req)) throw new HttpError(403, "Employer access required");
}

export function industryOf(v: unknown): IndustryId {
  if (!isIndustry(v)) throw new DomainError("Unknown industry");
  return v;
}

export const reviewerOf = (b: { reviewer?: unknown }) => String(b.reviewer ?? "").trim().slice(0, 40) || "Employer";

/** Runs a handler and returns its result as JSON; errors are mapped by `fail`. */
export async function handle(fn: () => unknown | Promise<unknown>, status = 200) {
  try {
    await hydrate(); // no-ops unless a durable store is configured
    const out = await fn();
    await persist();
    return NextResponse.json(out, { status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

/** Evidence uploads travel as base64 JSON, so those routes allow a larger body. */
export const readBody = (req: Request, big = false) => readJson(req, big ? 4_500_000 : 8_192);
