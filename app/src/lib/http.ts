import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { INDUSTRIES } from "./industries";
import type { IndustryId } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const isIndustry = (v: unknown): v is IndustryId =>
  typeof v === "string" && Object.hasOwn(INDUSTRIES, v);

/** Parse a JSON object body, rejecting oversized or malformed input. */
export async function readJson(req: Request, maxBytes = 8_192): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large");
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new HttpError(400, "Invalid JSON"); }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new HttpError(400, "Invalid request");
  return v as Record<string, unknown>;
}

// Fixed-window limiter keyed by caller. In-memory, so per-instance only; fine for the demo store.
const hits = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return; }
  if (++h.n > max) throw new HttpError(429, "Too many requests. Please wait a moment and try again.");
}

export function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Map thrown errors to JSON. Unexpected errors are logged without request data and not echoed. */
export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof Error && e.name === "DomainError") return NextResponse.json({ error: e.message }, { status: 400 });
  console.error("unhandled api error:", e instanceof Error ? e.message : "unknown");
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
