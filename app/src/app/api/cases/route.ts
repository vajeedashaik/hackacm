import { after } from "next/server";
import { investigateCase } from "@/lib/ai/orchestrator";
import { handle, industryOf, readBody } from "@/lib/api";
import { createCase, type NewCase } from "@/lib/store";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (v === undefined || v === "" ? undefined : Number(v));

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req, true);
    const input: NewCase = {
      type: b.type as NewCase["type"],
      industry: industryOf(b.industry),
      workerId: String(b.workerId),
      description: str(b.description) ?? "",
      date: str(b.date),
      hoursWorked: num(b.hoursWorked),
      amountPaid: num(b.amountPaid),
      category: str(b.category),
      location: str(b.location),
      severity: b.severity as NewCase["severity"],
      attendanceId: str(b.attendanceId),
      evidence: Array.isArray(b.evidence)
        ? b.evidence.map((f: { name?: unknown; type?: unknown; data?: unknown }) => ({
            name: String(f.name ?? "file"), type: String(f.type ?? ""), data: String(f.data ?? ""),
          }))
        : undefined,
    };
    const c = createCase(input);
    // agents analyse after the response is sent; a slow or failed model never blocks the worker
    after(() => investigateCase(c.industry, c.id));
    return c;
  }, 201);
}
