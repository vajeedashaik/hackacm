import { investigateCase } from "@/lib/ai/orchestrator";
import { handle, industryOf, readBody, requireEmployer } from "@/lib/api";
import { DomainError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Employer re-runs the agent investigation for a case (e.g. after adding a supervisor-entered shift). */
export async function POST(req: Request) {
  return handle(async () => {
    requireEmployer(req);
    const b = await readBody(req);
    const report = await investigateCase(industryOf(b.industry), String(b.caseId ?? ""));
    if (!report) throw new DomainError("Case not found");
    return report;
  });
}
