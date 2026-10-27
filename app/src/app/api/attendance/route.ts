import { after } from "next/server";
import { scanWorkload } from "@/lib/ai/orchestrator";
import { INDUSTRIES } from "@/lib/industries";
import { handle, industryOf, readBody, requireEmployer, reviewerOf } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { addShift, clock, seedDemoShifts } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const industry = industryOf(b.industry);
    switch (b.action) {
      case "in":
      case "out":
        clock(industry, String(b.workerId), b.action, b.siteCode ? String(b.siteCode) : undefined);
        after(() => scanWorkload(industry, String(b.workerId)));
        break;
      case "shift": // supervisor-assisted entry
        requireEmployer(req);
        addShift(industry, String(b.workerId), String(b.date), String(b.start), String(b.end), reviewerOf(b));
        after(() => scanWorkload(industry, String(b.workerId)));
        break;
      case "demo-seed":
        requireEmployer(req);
        seedDemoShifts(industry, reviewerOf(b));
        after(() => INDUSTRIES[industry].workers.forEach((w) => scanWorkload(industry, w.id)));
        break;
      default:
        throw new DomainError("Invalid request");
    }
    return { ok: true };
  });
}
