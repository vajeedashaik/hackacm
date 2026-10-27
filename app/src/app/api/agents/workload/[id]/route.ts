import { decideFlag } from "@/lib/ai/orchestrator";
import { handle, industryOf, readBody, requireEmployer, reviewerOf } from "@/lib/api";
import { DomainError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireEmployer(req);
    const { id } = await ctx.params;
    const b = await readBody(req);
    if (b.decision !== "accept" && b.decision !== "reject") throw new DomainError("Invalid decision");
    return decideFlag(
      { industry: industryOf(b.industry), actor: { role: "employer", name: reviewerOf(b) } },
      decodeURIComponent(id), b.decision,
    );
  });
}
