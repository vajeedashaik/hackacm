import { NextResponse } from "next/server";
import { isEmployer } from "@/lib/api";
import { fail } from "@/lib/http";
import { getEvidence } from "@/lib/store";

export const dynamic = "force-dynamic";

// Evidence is served only to the employer reviewer or to the worker who filed the case.
export async function GET(req: Request, ctx: { params: Promise<{ id: string; idx: string }> }) {
  try {
    const { id, idx } = await ctx.params;
    const { buffer, meta, workerId } = getEvidence(id, Number(idx));
    if (!isEmployer(req) && new URL(req.url).searchParams.get("workerId") !== workerId) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": meta.type,
        "Content-Disposition": `inline; filename="${encodeURIComponent(meta.name)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
