import { NextResponse } from "next/server";
import { industryOf, isEmployer } from "@/lib/api";
import { fail } from "@/lib/http";
import { snapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const industry = industryOf(u.searchParams.get("industry"));
    const workerId = u.searchParams.get("workerId") ?? undefined;
    return NextResponse.json(snapshot(industry, { employer: isEmployer(req), workerId }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
