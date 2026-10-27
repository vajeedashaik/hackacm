import { after } from "next/server";
import { investigateCase } from "@/lib/ai/orchestrator";
import { handle, readBody, requireEmployer, reviewerOf } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { actOnCase, reopenCase, type CaseAction } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const num = (v: unknown) => (v === undefined || v === "" ? undefined : Number(v));

/** Employer actions: assign, review, note, resolve, reject. */
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    requireEmployer(req);
    const { id } = await ctx.params;
    const b = await readBody(req);
    const reviewer = reviewerOf(b);
    const note = typeof b.note === "string" ? b.note : undefined;
    let act: CaseAction;
    switch (b.action) {
      case "assign": act = { action: "assign", reviewer, assignTo: String(b.assignTo ?? "") }; break;
      case "review":
      case "note": act = { action: b.action, reviewer, note }; break;
      case "resolve":
        act = { action: "resolve", reviewer, note, paidBack: num(b.paidBack), correctedHours: num(b.correctedHours) };
        break;
      case "reject": act = { action: "reject", reviewer, note }; break;
      default: throw new DomainError("Invalid action");
    }
    return actOnCase(id, act);
  });
}

/** Worker action: dispute a closed decision and reopen the case. */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const b = await readBody(req);
    if (b.action !== "reopen") throw new DomainError("Invalid action");
    const c = reopenCase(id, String(b.workerId), String(b.reason ?? ""));
    after(() => investigateCase(c.industry, c.id)); // fresh analysis, fresh pending proposal
    return c;
  });
}
