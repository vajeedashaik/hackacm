import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness check for the host. Reports no secrets and touches no state. */
export function GET() {
  return NextResponse.json({ ok: true, service: "fairshift" }, { headers: { "Cache-Control": "no-store" } });
}
