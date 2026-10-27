import { eventsFor, flagsFor } from "@/lib/ai/agentStore";
import { providerStatus } from "@/lib/ai/provider";
import { currentReport } from "@/lib/ai/tools";
import { voiceStatus } from "@/lib/ai/voice";
import { handle, industryOf, isEmployer } from "@/lib/api";
import { snapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Agent activity for the current viewer. Employers (valid PIN) see every report and proposal;
 * a worker sees only the plain-language explanation for their own cases.
 */
export async function GET(req: Request) {
  return handle(() => {
    const u = new URL(req.url);
    const industry = industryOf(u.searchParams.get("industry"));
    const employer = isEmployer(req);
    const workerId = employer ? undefined : u.searchParams.get("workerId") || undefined;
    const ctx = { industry, actor: { role: "system" } as const };
    const cases = snapshot(industry, { employer, workerId }).cases;

    const reports = cases.flatMap((c) => {
      const r = currentReport(ctx, c.id);
      if (!r) return [];
      return employer ? [r] : [{ caseId: r.caseId, explanation: r.explanation, missingInfo: r.missingInfo, sources: r.sources }];
    });

    return {
      provider: { configured: providerStatus().configured },
      voice: voiceStatus(),
      employer,
      events: eventsFor(industry, { employer, workerId }),
      reports,
      flags: employer ? flagsFor(industry) : [],
    };
  });
}
