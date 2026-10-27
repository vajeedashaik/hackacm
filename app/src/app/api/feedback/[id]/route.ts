import { handle, readBody, requireEmployer, reviewerOf } from "@/lib/api";
import { reviewFeedback } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireEmployer(req);
    const { id } = await ctx.params;
    reviewFeedback(id, reviewerOf(await readBody(req)));
    return { ok: true };
  });
}
