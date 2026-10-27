import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { industryOf, isEmployer } from "@/lib/api";
import { fail } from "@/lib/http";
import { snapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

// Pages poll this every few seconds. The ETag covers everything except the clock, so an unchanged
// state answers 304 with no body and the client skips parsing and re-rendering. It is derived from the
// viewer-specific body, so one viewer's tag can never validate another viewer's data.
export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const industry = industryOf(u.searchParams.get("industry"));
    const workerId = u.searchParams.get("workerId") ?? undefined;
    const snap = snapshot(industry, { employer: isEmployer(req), workerId });
    const etag = `"${createHash("sha1").update(JSON.stringify({ ...snap, now: 0 })).digest("base64url")}"`;
    const headers = { "Cache-Control": "no-store", ETag: etag };
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ...headers, "X-Server-Now": String(snap.now) } });
    }
    return NextResponse.json(snap, { headers });
  } catch (e) {
    return fail(e);
  }
}
