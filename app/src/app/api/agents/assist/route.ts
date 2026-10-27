import { recordEvent } from "@/lib/ai/agentStore";
import { workerPersonaAgent } from "@/lib/ai/agents";
import { handle, industryOf, readBody } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { clientKey, rateLimit } from "@/lib/http";
import { INDUSTRIES } from "@/lib/industries";

export const dynamic = "force-dynamic";

/** Worker Persona Agent: turns a rough message into a clear draft and suggests a report type. It files nothing. */
export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`assist:${clientKey(req)}`, 20, 60_000);
    const b = await readBody(req);
    const industry = industryOf(b.industry);
    const cfg = INDUSTRIES[industry];
    const worker = cfg.workers.find((w) => w.id === b.workerId);
    const message = typeof b.message === "string" ? b.message.trim() : "";
    if (!worker) throw new DomainError("Unknown worker");
    if (message.length < 5) throw new DomainError("Write a few words about the problem first");
    const out = await workerPersonaAgent({ cfg, message });
    recordEvent({
      industry, actor: "worker-persona", type: "agent-invoked", outcome: out.source === "model" ? "ok" : "fallback",
      source: out.source, workerId: worker.id,
      summary: `Drafted a ${out.value.kind} report from the worker's message (${out.source === "model" ? "model-assisted" : "rule-based"})`,
    });
    return { ...out.value, source: out.source };
  });
}
