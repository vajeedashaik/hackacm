import { decideProposal } from "@/lib/ai/tools";
import { handle, industryOf, readBody, requireEmployer, reviewerOf } from "@/lib/api";
import { DomainError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** The only way an agent proposal changes a case: an authorised employer accepts or rejects it. */
export async function POST(req: Request, ctx: { params: Promise<{ caseId: string }> }) {
  return handle(async () => {
    requireEmployer(req);
    const { caseId } = await ctx.params;
    const b = await readBody(req);
    if (b.decision !== "accept" && b.decision !== "reject") throw new DomainError("Invalid decision");
    const note = typeof b.note === "string" ? b.note.slice(0, 500) : undefined;
    return decideProposal(
      { industry: industryOf(b.industry), actor: { role: "employer", name: reviewerOf(b) } },
      caseId, b.decision, note,
    );
  });
}
