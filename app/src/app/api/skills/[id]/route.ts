import { handle, readBody, requireEmployer, reviewerOf } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { skillAction } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const b = await readBody(req);
    if (b.action === "request" || b.action === "remove") {
      return skillAction(id, { action: b.action, workerId: String(b.workerId) });
    }
    if (b.action === "verify" || b.action === "decline") {
      requireEmployer(req);
      return skillAction(id, { action: b.action, reviewer: reviewerOf(b) });
    }
    throw new DomainError("Invalid action");
  });
}
